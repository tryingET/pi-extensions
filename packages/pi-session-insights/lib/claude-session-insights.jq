# Explicit Claude JSONL physical-history adapter. Invoke jq -Rn, never --slurp.
# No tool bodies, arguments, thinking, attachment bodies, queue bodies or prompts.
def s($n): if type == "string" then .[0:$n] else null end;
def exact_id: if type == "string" and length > 0 and length <= 256 then . else null end;
def ref: {line, uuid:(.record.uuid | exact_id)};
def obj: if type == "object" then . else {} end;
def normalize_record:
  .message |= obj | .origin |= obj | .attachment |= obj
  | .toolUseResult |= obj | .compactMetadata |= obj;
def blocks:
  (.message | obj | .content) | if type == "array" then . else [] end;
def text:
  (.message | obj | .content) | if type == "string" then .
  elif type == "array" then [ .[] | select(type == "object" and .type == "text") | .text | strings ] | join("\n")
  else "" end;
def known_type:
  IN("user", "assistant", "system", "last-prompt", "queue-operation", "attachment",
     "file-history-snapshot", "file-history-delta", "summary", "progress", "ai-title",
     "mode", "permission-mode", "atis-latch", "custom-title", "tag", "agent-name");
def valid_path_ref:
  type == "string" and length > 0 and length <= 4096 and (test("[\\x00-\\x1f\\x7f]")|not);
def path_ref:
  select(valid_path_ref)
  | {path:., status:"not_inspected", trust:"untrusted_source_reference"};
def sidecars:
  [ (.toolUseResult | obj | (.outputFile, .output_file, .filePath)),
    ((.message | obj | .content) | arrays | .[] | objects | select(.type == "tool_result")
      | .content? | strings
      | scan("(?:/|~/)[^\\s<>\"']*/tool-results/[^\\s<>\"']+")) ]
  | map(path_ref) | unique_by(.path);
def tool_refs:
  blocks | to_entries | map(.key as $i | .value | objects
    | if .type == "tool_use" then
        {block:$i, kind:"call", id:(.id|exact_id), name:(.name|s(128)),
         task_id:((.input | obj) | .taskId // .task_id | exact_id),
         agent_id:((.input | obj) | .agentId // .agent_id | exact_id)}
      elif .type == "tool_result" then
        {block:$i, kind:"result", id:(.tool_use_id|exact_id),
         reported_error:(if (.is_error|type)=="boolean" then .is_error else null end)}
      else empty end);
def strict_scalar_tokens:
  # One lexical scan, with complete strings and delimited standard scalar tokens.
  # Structural syntax/escape checks remain jq's decoder; no rewrite of source values.
  test("^(?:[\\[\\]{}:, \\t\\r]|\"(?:[^\"\\\\]|\\\\.)*\"|(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)(?=[\\[\\]{}:, \\t\\r]|$))*$");
def issues:
  [if (.uuid? != null and (.uuid|exact_id)==null) then "invalid_uuid" else empty end,
   if (.parentUuid? != null and (.parentUuid|exact_id)==null) then "invalid_parent_uuid" else empty end,
   if (.type|type)!="string" then "missing_or_invalid_record_type" else empty end,
   if (.type|known_type|not) then "unsupported_record_type" else empty end,
   if any((.toolUseResult|obj|.outputFile,.output_file,.filePath); .!=null and (valid_path_ref|not)) then "invalid_sidecar_path" else empty end,
   if any([.message,.origin,.attachment,.toolUseResult,.compactMetadata][]; .!=null and type!="object") then "unsupported_nested_shape" else empty end,
   if (.message|obj|.content) as $c | $c!=null and ($c|type)!="string" and ($c|type)!="array" then "unsupported_content_shape" else empty end,
   if any((blocks)[]; type!="object" or (.type|type)!="string") then "unsupported_block_shape" else empty end,
   if any((blocks)[]|objects; .type=="text" and (.text|type)!="string") then "invalid_text_block" else empty end,
   if any((blocks)[]|objects; .type=="tool_use" and ((.id|exact_id)==null or (.name|type)!="string")) then "invalid_tool_call_metadata" else empty end,
   if any((blocks)[]|objects; .type=="tool_result" and ((.tool_use_id|exact_id)==null or (has("is_error") and (.is_error|type)!="boolean"))) then "invalid_tool_result_metadata" else empty end];
def has_refs:
  (tool_refs|length)>0 or (sidecars|length)>0 or .type=="queue-operation"
  or .origin!=null or .isSidechain==true
  or any([.agentId, .parentToolUseID, .parentSessionId, .sourceToolUseID, .sourceToolAssistantUUID,
    (.toolUseResult|obj|.task_id,.backgroundTaskId,.agentId,.msg_id), (.data|obj|.agentId)][]; .!=null);
def project:
  . as $row | (.record | normalize_record) as $r
  | ($r | text) as $text
  | {source:($row|ref), type:($r.type|s(80)), timestamp:($r.timestamp|s(80)),
     parent_uuid:($r.parentUuid|exact_id), issues:($row.record|issues),
     session_id:($r.sessionId // $r.session_id | exact_id),
     is_sidechain:(if ($r.isSidechain|type)=="boolean" then $r.isSidechain else null end),
     agent_id:($r.agentId|exact_id),
     child_refs:{parent_tool_use_id:($r.parentToolUseID|exact_id),
       parent_session_id:($r.parentSessionId|exact_id), agent_id:($r.data|obj|.agentId|exact_id)},
     subtype:($r.subtype|s(80)),
     message:{role:($r.message.role|s(32)), authorship:"unknown",
       origin_kind:($r.origin.kind|s(80)), turn_origin:($r.turnOrigin|s(80)),
       is_meta:($r.isMeta == true), is_compact_summary:($r.isCompactSummary == true),
       content_types:([$r | blocks | .[] | objects | .type | strings] | unique | .[0:32] | map(s(80))),
       content_types_truncated:(([$r | blocks | .[] | objects | .type | strings] | unique | length)>32),
       text_chars:($text|length), text_omitted:((($text|length)>0) and (($include_text|not) or ($r.type!="user" and $r.type!="assistant"))),
       text:(if $include_text and ($r.type=="user" or $r.type=="assistant") then $text[0:$max_text_chars] else null end),
       text_truncated:($include_text and ($r.type=="user" or $r.type=="assistant") and ($text|length)>$max_text_chars),
       claim_status:"unverified_session_content"},
     leaf_pointer:(if $r.type=="last-prompt" then ($r.leafUuid|exact_id) else null end),
     compaction:(if ($r.subtype=="compact_boundary" or $r.isCompactSummary==true or $r.type=="summary") then
       {subtype:($r.subtype|s(80)), logical_parent_uuid:($r.logicalParentUuid|exact_id),
        leaf_uuid:($r.leafUuid|exact_id),
        pre_tokens:(if ($r.compactMetadata.preTokens|type)=="number" then $r.compactMetadata.preTokens else null end),
        effective_context:"unsupported"} else null end),
     attachment_type:($r.attachment.type|s(80)),
     queue_operation:(if $r.type=="queue-operation" then ($r.operation|s(80)) else null end),
     peer_refs:{source_tool_assistant_uuid:($r.sourceToolAssistantUUID|exact_id),
       source_tool_use_id:($r.sourceToolUseID|exact_id),
       message_id:($r.origin.msg_id // $r.toolUseResult.msg_id | exact_id)},
     task_refs:{task_id:($r.toolUseResult.task_id|exact_id),
       background_task_id:($r.toolUseResult.backgroundTaskId|exact_id),
       agent_id:($r.toolUseResult.agentId|exact_id)},
     tools:($r|tool_refs), sidecars:($r|sidecars)};
def walk_chain($index; $id; $limit):
  {ids:[], next:$id, status:"complete"}
  | until(.next == null or .status != "complete";
      .next as $id
      | if (.ids|index($id)) != null then .status="cycle"
        elif ($index|has($id)|not) then .status="missing_parent"
        elif (.ids|length)>=$limit then .status="budget_exhausted"
        else .ids += [$id]
          | if $index[$id].record.parentUuid!=null and ($index[$id].record.parentUuid|exact_id)==null
            then .status="invalid_parent" else .next = ($index[$id].record.parentUuid|exact_id) end end);

# Raw input is read one physical line at a time. No parse error text can escape.
if $page_size<1 or $page_size>100 or $page<1 or $page>1000000
   or $max_chain<1 or $max_chain>4096 or $max_text_chars<1 or $max_text_chars>2000
   or $max_line_chars<1 or $max_line_chars>8388608 then error("invalid_limits") else . end
| [limit(200001; inputs) | input_line_number as $line
  | if length > $max_line_chars then {line:$line,error:"line_budget_exceeded"}
    else . as $raw | (try {line:$line,record:fromjson} catch {line:$line,error:"malformed_json"})
      | if has("record") and ($raw|strict_scalar_tokens|not) then {line:$line,error:"nonstandard_json_token"}
        elif has("record") and (.record|type)!="object" then {line:$line,error:"record_not_object"} else . end
    end] as $rows
| if ($rows|length)>200000 then error("record_budget_exceeded") else . end
| [$rows[]|select(has("record"))] as $valid
| [$rows[]|select(has("error"))|{line,error}] as $errors
| [$valid[]|select((.record.uuid|exact_id)!=null)] as $nodes
| ($nodes|group_by(.record.uuid)|map(select(length>1))|length) as $duplicate_ids
| (reduce $nodes[] as $n ({}; .[$n.record.uuid]=$n)) as $index
| (reduce $nodes[] as $n ({}; if ($n.record.parentUuid|exact_id)!=null then .[$n.record.parentUuid]=true else . end)) as $parents
| [$nodes[]|select($parents[.record.uuid]!=true)] as $leaves
# Explicit binding avoids reading parentUuid against the index object.
| [$nodes[]|. as $n|select(($n.record.parentUuid|exact_id)!=null and ($index|has($n.record.parentUuid)|not))] as $orphans
| (if $leaf != "" and $duplicate_ids==0 then walk_chain($index; $leaf; $max_chain) else null end) as $chain
| (if $view=="leaves" then $leaves
   elif $view=="errors" then $errors
   elif $view=="chain" then [$nodes[]|.record.uuid as $id|select(($chain.ids//[]|index($id))!=null)]
   elif $view=="references" then [$valid[]|select(.record|has_refs)]
   elif $view=="compactions" then [$valid[]|select(.record.subtype=="compact_boundary" or .record.isCompactSummary==true or .record.type=="summary")]
   else $rows end) as $selected
| (($page-1)*$page_size) as $offset
| {schema:"agent.session-recovery.claude.v1", ok:true, adapter:"claude", bounded_output:true,
   session_file:$session_file,
   support:{selection:"explicit_adapter_not_format_detection", qualified_version:"2.1.280",
     declared_scope:"selected_record_variants_and_metadata_only_private_samples",
     effective_context:"unsupported", full_schema_coverage:false,
     observed_version_status:(if ([$valid[].record.version|strings]|length)==0 then "unknown"
       elif any($valid[].record.version|strings; .!="2.1.280") then "unqualified_version_present"
       else "qualified_version_observed_not_full_format_coverage" end)},
   coverage:{physical_lines:($rows|length), parsed_objects:($valid|length),
     parse_errors:($errors|length), uuid_nodes:($nodes|length), duplicate_uuid_values:$duplicate_ids,
     leaf_count:($leaves|length), missing_parent_count:($orphans|length),
     record_types:($valid|group_by(.record.type)|map({type:(.[0].record.type|s(80)),count:length})|.[0:64]),
     record_type_distinct_total:($valid|map(.record.type)|unique|length),
     record_types_truncated:(($valid|map(.record.type)|unique|length)>64),
     unsupported_record_count:([$valid[]|select(.record.type|known_type|not)]|length),
     records_with_shape_or_type_issues:([$valid[]|select((.record|issues|length)>0)]|length),
     versions:([$valid[].record.version|strings]|unique|.[0:16]|map(s(80))),
     version_distinct_total:([$valid[].record.version|strings]|unique|length),
     versions_truncated:(([$valid[].record.version|strings]|unique|length)>16),
     compaction_records:([$valid[]|select(.record.subtype=="compact_boundary" or .record.isCompactSummary==true or .record.type=="summary")]|length),
     tool_calls:([$valid[].record|tool_refs[]|select(.kind=="call")]|length),
     tool_results:([$valid[].record|tool_refs[]|select(.kind=="result")]|length)},
   graph:{last_appended_uuid:($nodes[-1]|if .==null then null else ref end),
     last_prompt_pointer:([$valid[]|select(.record.type=="last-prompt")][-1]|if .==null then null else {source:ref,leaf_uuid:(.record.leafUuid|exact_id)} end),
     active_leaf:"not_inferred", effective_context:"unsupported",
     chain_status:(if $duplicate_ids>0 then "ambiguous_duplicate_uuids" elif $chain!=null then $chain.status else "not_requested" end),
     chain_nodes:($chain.ids//[]|length), chain_order:"physical_append_order"},
   pagination:{view:$view,page:$page,page_size:$page_size,total:($selected|length),
     returned:($selected[$offset:$offset+$page_size]|length),
     next_page:(if $offset+$page_size<($selected|length) then $page+1 else null end)},
   records:[$selected[$offset:$offset+$page_size][]|. as $row|if has("record") then (try project catch {source:($row|ref),error:"unsupported_record_shape"}) else {source:{line},error} end],
   omissions:["no_effective_context_reconstruction", "no_authenticated_human_authorship", "no_authority_or_completion_inference",
     "no_cross_file_or_fork_deduplication", "no_automatic_child_or_sidecar_traversal",
     "tool_arguments_results_thinking_attachments_queue_bodies_omitted", "unrecognized_fields_not_interpreted",
     "sidecar_references_are_candidates_not_exhaustive", "counts_cover_parsed_objects_only",
     "graph_cycles_checked_only_for_explicit_chain", "metadata_strings_may_be_truncated"],
   limits:{max_text_chars:$max_text_chars,max_line_chars:$max_line_chars,max_chain:$max_chain,
     max_physical_lines:200000,input_memory:"scales_with_bounded_single_file",text_included:$include_text}}
