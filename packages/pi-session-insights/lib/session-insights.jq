# summary: "Deterministically extracts bounded Pi session insight facts from one slurped JSONL stream."
# read_when:
#   - "Changing the pi-session-insights machine contract or session-tree reconstruction."

# The caller must invoke jq with --slurp and provide:
#   --arg session_file <path>
#   --argjson max_text_chars <positive integer>
#   --argjson max_chain <positive integer>
#   --argjson attribution '{}' OR --slurpfile attribution <json-file>


def normalized_attribution_doc:
  if type == "array" then (.[0] // {}) else . end;

def iso_to_epoch:
  if type == "string" then
    try (
      capture("^(?<whole>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\\.(?<fraction>[0-9]+))?Z$")
      | ((.whole + "Z") | fromdateiso8601)
        + (if (.fraction? // "") == "" then 0 else ("0." + .fraction | tonumber) end)
    ) catch (try fromdateiso8601 catch null)
  else
    null
  end;

def entry_epoch:
  ((.timestamp? | iso_to_epoch)
    // (if (.message?.timestamp? | type) == "number" then (.message.timestamp / 1000) else null end)
    // 0);

def entry_timestamp:
  (.timestamp?
    // (if (.message?.timestamp? | type) == "number"
        then ((.message.timestamp / 1000) | todateiso8601)
        else null
      end));

def visible_content_text:
  if type == "string" then
    .
  elif type == "array" then
    [
      .[]
      | if type == "string" then
          .
        elif type == "object" and .type == "text" then
          (.text // "")
        else
          empty
        end
    ]
    | join("\n")
  else
    ""
  end;

def reference_content_text:
  if type == "string" then
    .
  elif type == "array" then
    [
      .[]
      | if type == "string" then
          .
        elif type == "object" and .type == "text" then
          (.text // "")
        else
          empty
        end
    ]
    | join("\n")
  else
    ""
  end;

def cap_text($maximum):
  if length <= $maximum then . else .[0:$maximum] + "…<truncated>" end;

def cap_optional_string($maximum):
  if type == "string" then cap_text($maximum) else null end;

def cap_required_string($maximum; $fallback):
  if type == "string" then cap_text($maximum) else $fallback end;


def is_nonblank_string:
  type == "string" and test("\\S");

def message_epoch($entry; $message):
  (if ($message.timestamp? | type) == "number"
   then ($message.timestamp / 1000)
   else ($entry | entry_epoch)
   end);

def message_timestamp($entry; $message):
  (if ($message.timestamp? | type) == "number"
   then (($message.timestamp / 1000) | todateiso8601)
   else ($entry | entry_timestamp)
   end);

def message_candidate($entry; $message; $source; $order; $maximum):
  ($message.content? | visible_content_text) as $raw_text
  | {
      entry_id: $entry.id,
      timestamp: message_timestamp($entry; $message),
      source: $source,
      role: ($message.role // "unknown"),
      text: ($raw_text | cap_text($maximum)),
      raw_text: $raw_text,
      epoch: message_epoch($entry; $message),
      order: $order
    };

def is_scout_boot_text:
  ascii_downcase
  | test("(^|\\n)(you are (a )?(clean |visible |read-only )*(scout|reviewer)|scouting objective:|review objective:)|clean visible (scout|review) peer|report back with peer_ack and peer_final"; "i");

def is_subagent_boot_text:
  ascii_downcase
  | test("(^|\\n)(# (visible )?subagent.*prompt|you are (a )?(specialized |focused |clean |visible )*subagent\\b|subagent objective:|asc child session( boot)?:|parent controller handoff:)"; "i");

def is_fork_boot_text:
  ascii_downcase
  | test("(^|\\n)(# visible fork peer prompt|you are (a )?(visible )?fork peer\\b|forked-context peer objective:|spawned fork peer\\b)"; "i");

def is_spawn_boot_text:
  (is_scout_boot_text or is_subagent_boot_text or is_fork_boot_text);

def is_peer_injected_text:
  test("^(\\*\\*📨 From peer-session|<intercom|PEER_(ACK|FINAL)\\b)"; "i");

def classify_session_role($header; $first_user_text):
  if ($first_user_text // "" | is_scout_boot_text) then
    "scout"
  elif ($first_user_text // "" | is_subagent_boot_text) then
    "subagent"
  elif (($header.parentSession? // "") | length) > 0
      or ($first_user_text // "" | is_fork_boot_text) then
    "fork"
  elif $first_user_text != null then
    "controller"
  else
    "unknown"
  end;

def chain_descending($entry_by_id; $entry; $seen):
  if $entry == null then
    {entries: [], cycle: false, missing_parent: false, missing_parent_id: null}
  elif ($seen[$entry.id] // false) then
    {entries: [], cycle: true, missing_parent: false, missing_parent_id: null}
  else
    ($seen + {($entry.id): true}) as $next_seen
    | ($entry.parentId // null) as $parent_id
    | if $parent_id == null then
        {entries: [$entry], cycle: false, missing_parent: false, missing_parent_id: null}
      elif $entry_by_id[$parent_id] == null then
        {entries: [$entry], cycle: false, missing_parent: true, missing_parent_id: $parent_id}
      else
        chain_descending($entry_by_id; $entry_by_id[$parent_id]; $next_seen) as $rest
        | ($rest | .entries = ([$entry] + .entries))
      end
  end;

def bounded_chain_ids($chain; $maximum):
  (if ($chain | length) <= $maximum then
     [$chain[] | .id]
   elif $maximum <= 1 then
     [($chain[-1] | .id)]
   else
     [($chain[0] | .id)] + [($chain[-($maximum - 1):][] | .id)]
   end)
  | map(cap_required_string(256; "invalid-entry-id"));

def public_message_record:
  if . == null then
    null
  else
    {
      entry_id: (.entry_id | cap_required_string(256; "invalid-entry-id")),
      timestamp: (.timestamp | cap_optional_string(128)),
      source: (.source | cap_required_string(64; "unknown")),
      text
    }
  end;

def entry_search_text:
  if .type == "message" and (.message? | type) == "object" then
    (.message.content? | reference_content_text)
  elif .type == "custom_message" then
    (.content? | reference_content_text)
  elif .type == "compaction" or .type == "branch_summary" then
    ((.summary // "") | cap_required_string(65536; ""))
  else
    ""
  end;

def task_ids_from_text:
  [
    (scan("\\bAK[- #:]?([0-9]{1,8})\\b"; "i") | .[0]),
    (scan("\\btask[- #:]([0-9]{1,8})\\b"; "i") | .[0])
  ]
  | map(tonumber);

def mutation_tool_calls($entries):
  [
    $entries[]
    | select(.type == "message" and .message?.role == "assistant")
    | .message.content[]?
    | select(type == "object" and .type == "toolCall")
  ];

def mutation_paths($tool_calls):
  [
    $tool_calls[]
    | ((.name // "") | ascii_downcase) as $name
    | select($name | test("(^|\\.)(edit|write)$"))
    | (.arguments?.path? // .arguments?.file? // .arguments?.filePath? // empty)
    | select(is_nonblank_string)
  ]
  | unique;

def mutation_root($path; $cwd):
  if ($path | startswith("/")) then
    (try (
      $path
      | capture("^(?<root>/home/[^/]+/ai-society/softwareco/(owned|infra|contrib|agents|fork)/[^/]+)")
      | .root
    ) catch (
      $path
      | split("/")
      | if length > 2 then .[0:-1] | join("/") else $path end
    ))
  elif (($cwd // "") | is_nonblank_string) then
    $cwd
  else
    null
  end;

def attr_raw($attr; $key):
  ($attr[$key] // null);

def sourced_attr_record($attr; $key):
  attr_raw($attr; $key) as $raw
  | if ($raw | type) == "object"
      and ($raw | has("value"))
      and ($raw.source? | is_nonblank_string) then
      $raw
    else
      null
    end;

def sourced_attr_string($attr; $key; $default):
  sourced_attr_record($attr; $key) as $record
  | if $record != null
      and ($record.value | is_nonblank_string) then
      ($record.value | cap_text(4096))
    else
      $default
    end;

def sourced_attr_string_source($attr; $key):
  sourced_attr_record($attr; $key) as $record
  | if $record != null
      and ($record.value | is_nonblank_string) then
      ($record.source | cap_text(2048))
    else
      null
    end;

def sourced_attr_list_source($attr; $key):
  sourced_attr_record($attr; $key) as $record
  | if $record != null and (($record.value | type) == "array") then
      ($record.source | cap_text(2048))
    else
      null
    end;

def sourced_attr_list($attr; $key):
  sourced_attr_record($attr; $key) as $record
  | if $record != null and (($record.value | type) == "array") then
      [
        $record.value[]
        | select(is_nonblank_string)
      ]
    else
      []
    end;

def bounded_attr_uncertainties($attr):
  if (($attr.uncertainties? | type) == "array") then
    [
      $attr.uncertainties[]
      | select(is_nonblank_string)
      | cap_text(1000)
    ][0:64]
  else
    []
  end;

def attr_uncertainties_total($attr):
  if (($attr.uncertainties? | type) == "array") then
    [$attr.uncertainties[] | select(is_nonblank_string)] | length
  else
    0
  end;

def valid_propagation_state:
  . == "session-only"
    or . == "session + diary"
    or . == "session + crystallized"
    or . == "session + propagated";

($max_text_chars
  | if type == "number" and . == floor and . >= 1 and . <= 65536 then .
    else error("max_text_chars must be an integer from 1 through 65536") end) as $text_limit
| ($max_chain
  | if type == "number" and . == floor and . >= 1 and . <= 4096 then .
    else error("max_chain must be an integer from 1 through 4096") end) as $chain_limit
| . as $rows
| [$rows[] | select(type == "object" and .type == "session")] as $headers
| if ($headers | length) != 1 then
    error("expected exactly one Pi session header")
  else
    $headers[0] as $header
    | [$rows[] | select(type == "object" and .type != "session" and (.id? | type) == "string")] as $entries
    | ($entries | map(.id) | group_by(.) | map(select(length > 1) | .[0])) as $duplicate_ids
    | if ($duplicate_ids | length) > 0 then
        error("duplicate session entry ids (\($duplicate_ids | length)): \($duplicate_ids[0:16] | map(cap_text(256)) | join(","))")
      else
        ($entries | map({key: .id, value: .}) | from_entries) as $entry_by_id
        | ($entries[-1] // null) as $leaf
        | chain_descending($entry_by_id; $leaf; {}) as $descending_chain
        | ($descending_chain.entries | reverse) as $active_chain
        | [
            $active_chain
            | to_entries[]
            | .key as $chain_index
            | .value as $entry
            | if $entry.type == "message" and ($entry.message? | type) == "object" then
                message_candidate($entry; $entry.message; "message"; ($chain_index * 100000); $text_limit)
              elif $entry.type == "compaction" and ($entry.retainedTail? | type) == "array" then
                $entry.retainedTail
                | to_entries[]
                | message_candidate(
                    $entry;
                    .value;
                    "compaction.retainedTail";
                    ($chain_index * 100000 + .key + 1);
                    $text_limit
                  )
              else
                empty
              end
          ] as $active_messages
        | ([
            $entries[]
            | select(.type == "message" and .message?.role == "user")
            | {
                entry_id: .id,
                text: (.message.content? | visible_content_text)
              }
          ][0] // null) as $first_user
        | ($first_user.text // null) as $first_user_text
        | classify_session_role($header; $first_user_text) as $session_role
        | ($active_messages
            | map(select(
                .role == "user"
                and (((.entry_id == ($first_user.entry_id // null)) and (.raw_text | is_spawn_boot_text)) | not)
                and (((.source == "compaction.retainedTail") and (.raw_text == $first_user_text)) | not)
                and ((.raw_text | is_peer_injected_text) | not)
              ))
            | sort_by([.epoch, .order])
            | (last // null)) as $latest_operator
        | ($active_messages
            | map(select(.role == "assistant" and (.raw_text | length) > 0))
            | sort_by([.epoch, .order])
            | (last // null)) as $latest_assistant
        | ($entries
            | to_entries
            | map({
                entry_id: .value.id,
                type: .value.type,
                timestamp: (.value | entry_timestamp),
                epoch: (.value | entry_epoch),
                order: .key
              })
            | sort_by([.epoch, .order])
            | (last // null)) as $latest_activity
        | ([
            $entries[]
            | select(.type == "custom" or .type == "custom_message")
            | (.customType // "unknown")
            | if is_nonblank_string then . else "unknown" end
          ]
          | sort
          | group_by(.)
          | map({key: .[0], value: length})
          | sort_by(.key)) as $custom_type_counts
        | ($custom_type_counts[0:128]
            | to_entries
            | map({
                ordinal: .key,
                type: (.value.key | cap_text(256)),
                type_truncated: ((.value.key | length) > 256),
                count: .value.value
              })) as $custom_entry_types
        | ([
            $entries
            | to_entries[]
            | .key as $entry_order
            | .value as $entry
            | ($entry | entry_search_text)
            | select(length > 0)
            | task_ids_from_text[]
            | {
                id: .,
                epoch: ($entry | entry_epoch),
                order: $entry_order
              }
          ]) as $task_id_occurrences
        | ($task_id_occurrences
            | group_by(.id)
            | map(max_by([.epoch, .order]))
            | sort_by([.epoch, .order, .id])
            | reverse) as $task_ids_by_recency
        | ($task_ids_by_recency[0:128] | map(.id)) as $ak_task_ids
        | mutation_tool_calls($entries) as $tool_calls
        | mutation_paths($tool_calls) as $mutation_paths
        | ([$mutation_paths[] | mutation_root(.; $header.cwd)] | map(select(. != null)) | unique) as $derived_mutation_roots
        | ([
            $tool_calls[]
            | ((.name // "") | ascii_downcase)
            | select(test("(^|\\.)bash$"))
          ] | length) as $bash_tool_call_count
        | (reduce ($entries[] | .parentId? // empty) as $parent_id ({}; .[$parent_id] = true)) as $parent_ids
        | [$entries[] | select(($parent_ids[.id] // false) | not)] as $leaf_candidates
        | ($attribution | normalized_attribution_doc) as $attribution_doc
        | ((($attribution_doc | type) == "object")
            and (($attribution_doc.schema? // null) == "pi.session-insights.attribution.v1")
            and (($attribution_doc.attributions? | type) == "object")) as $attribution_schema_valid
        | (if $attribution_schema_valid then
             ($attribution_doc.attributions?[$header.id]
               // $attribution_doc.attributions?[$session_file]
               // {})
           else
             {}
           end) as $attr
        | sourced_attr_string($attr; "authority_repo"; null) as $authority_repo
        | sourced_attr_string($attr; "runtime_owner"; null) as $runtime_owner
        | sourced_attr_string($attr; "kes_destination"; null) as $kes_destination
        | sourced_attr_string($attr; "propagation_state"; "session-only") as $raw_propagation_state
        | (if ($raw_propagation_state | valid_propagation_state)
           then $raw_propagation_state
           else "session-only"
           end) as $propagation_state
        | (sourced_attr_list($attr; "observed_mutation_roots")
            + [$derived_mutation_roots[] | select(is_nonblank_string)]
            | unique) as $all_observed_mutation_roots
        | ([$all_observed_mutation_roots[0:128][] | cap_text(4096)]) as $observed_mutation_roots
        | (([
            if ($active_chain | length) > $chain_limit then "active_parent_chain_truncated" else empty end,
            if $descending_chain.cycle then "active_parent_chain_cycle_detected" else empty end,
            if $descending_chain.missing_parent then
              "active_parent_chain_missing_parent:\($descending_chain.missing_parent_id | cap_required_string(256; "invalid-parent-id"))"
            else empty end,
            if ($leaf_candidates | length) > 1 then
              "active_leaf_derived_from_last_appended_entry_among_multiple_leaves"
            else empty end,
            if ($attribution_doc | length) == 0 then "attribution_not_provided" else empty end,
            if ($attribution_doc | length) > 0 and ($attribution_schema_valid | not) then
              "attribution_schema_invalid_or_unsupported"
            else empty end,
            if attr_raw($attr; "authority_repo") != null
                and sourced_attr_record($attr; "authority_repo") == null then
              "attribution_authority_repo_ignored_without_source"
            else empty end,
            if sourced_attr_record($attr; "authority_repo") != null
                and (sourced_attr_record($attr; "authority_repo").value | is_nonblank_string | not) then
              "attribution_authority_repo_invalid_value"
            else empty end,
            if attr_raw($attr; "runtime_owner") != null
                and sourced_attr_record($attr; "runtime_owner") == null then
              "attribution_runtime_owner_ignored_without_source"
            else empty end,
            if sourced_attr_record($attr; "runtime_owner") != null
                and (sourced_attr_record($attr; "runtime_owner").value | is_nonblank_string | not) then
              "attribution_runtime_owner_invalid_value"
            else empty end,
            if attr_raw($attr; "kes_destination") != null
                and sourced_attr_record($attr; "kes_destination") == null then
              "attribution_kes_destination_ignored_without_source"
            else empty end,
            if sourced_attr_record($attr; "kes_destination") != null
                and (sourced_attr_record($attr; "kes_destination").value | is_nonblank_string | not) then
              "attribution_kes_destination_invalid_value"
            else empty end,
            if attr_raw($attr; "propagation_state") != null
                and sourced_attr_record($attr; "propagation_state") == null then
              "attribution_propagation_state_ignored_without_source"
            else empty end,
            if sourced_attr_record($attr; "propagation_state") != null
                and (sourced_attr_record($attr; "propagation_state").value | is_nonblank_string | not) then
              "attribution_propagation_state_invalid_value"
            else empty end,
            if attr_raw($attr; "observed_mutation_roots") != null
                and sourced_attr_record($attr; "observed_mutation_roots") == null then
              "attribution_observed_mutation_roots_ignored_without_source"
            else empty end,
            if sourced_attr_record($attr; "observed_mutation_roots") != null
                and ((sourced_attr_record($attr; "observed_mutation_roots").value | type) != "array") then
              "attribution_observed_mutation_roots_invalid_value"
            else empty end,
            if sourced_attr_record($attr; "observed_mutation_roots") != null
                and ((sourced_attr_record($attr; "observed_mutation_roots").value | type) == "array")
                and ([sourced_attr_record($attr; "observed_mutation_roots").value[]
                      | select(is_nonblank_string | not)] | length) > 0 then
              "attribution_observed_mutation_roots_invalid_elements_ignored"
            else empty end,
            if $authority_repo == null then "authority_repo_unresolved" else empty end,
            if $runtime_owner == null then "runtime_owner_unresolved" else empty end,
            if $kes_destination == null then "kes_destination_unresolved" else empty end,
            if ($raw_propagation_state | valid_propagation_state | not) then
              "invalid_propagation_state_defaulted_to_session-only"
            else empty end,
            if $bash_tool_call_count > 0 then
              "bash_tool_calls_not_parsed_for_mutation_roots"
            else empty end,
            if ($derived_mutation_roots | length) > 0 then
              "derived_mutation_roots_are_path_observations_not_authority"
            else empty end,
            if ($all_observed_mutation_roots | length) > 128 then
              "observed_mutation_roots_truncated"
            else empty end,
            if ([$all_observed_mutation_roots[0:128][] | select(length > 4096)] | length) > 0 then
              "observed_mutation_root_strings_truncated"
            else empty end,
            if ($custom_type_counts | length) > 128 then
              "custom_entry_types_truncated"
            else empty end,
            if ([$custom_type_counts[0:128][] | select((.key | length) > 256)] | length) > 0 then
              "custom_entry_type_strings_truncated"
            else empty end,
            if ($task_ids_by_recency | length) > 128 then
              "ak_task_ids_truncated_to_most_recent"
            else empty end,
            if attr_uncertainties_total($attr) > 64 then
              "attribution_uncertainties_truncated"
            else empty end,
            if $session_role == "unknown" then "session_role_unresolved" else empty end,
            if ($session_role == "scout" or $session_role == "subagent" or $session_role == "fork")
                and $latest_operator == null then
              "spawn_boot_prompt_excluded_from_latest_operator_message"
            else empty end
          ] + bounded_attr_uncertainties($attr))
          | map(select(is_nonblank_string) | cap_text(1000))
          | unique
          | .[0:128]) as $uncertainties
        | {
            schema: "pi.session-insights.v1",
            bounded_output: true,
            output_limits: {
              latest_text_chars: $text_limit,
              active_parent_chain_ids: $chain_limit,
              task_ids: 128,
              mutation_roots: 128,
              custom_entry_types: 128,
              uncertainties: 128,
              metadata_string_chars: 4096
            },
            session_file: ($session_file | cap_text(4096)),
            session_id: ($header.id | cap_required_string(256; "invalid-session-id")),
            session_header_cwd: (($header.cwd // null) | cap_optional_string(4096)),
            session_role: $session_role,
            session_start: (($header.timestamp // null) | cap_optional_string(128)),
            latest_meaningful_activity: (
              if $latest_activity == null then null else {
                entry_id: ($latest_activity.entry_id | cap_required_string(256; "invalid-entry-id")),
                type: ($latest_activity.type | cap_required_string(128; "unknown")),
                timestamp: ($latest_activity.timestamp | cap_optional_string(128))
              } end
            ),
            latest_operator_message: ($latest_operator | public_message_record),
            latest_assistant_text: ($latest_assistant | public_message_record),
            active_leaf: (
              if $leaf == null then null else {
                id: ($leaf.id | cap_required_string(256; "invalid-entry-id")),
                type: ($leaf.type | cap_required_string(128; "unknown")),
                timestamp: (($leaf | entry_timestamp) | cap_optional_string(128)),
                derivation: "last_appended_tree_entry"
              } end
            ),
            active_parent_chain: bounded_chain_ids($active_chain; $chain_limit),
            active_parent_chain_total: ($active_chain | length),
            active_parent_chain_truncated: (($active_chain | length) > $chain_limit),
            compaction_count: ([$entries[] | select(.type == "compaction")] | length),
            retained_tail_compaction_count: ([$entries[] | select(.type == "compaction" and (.retainedTail? | type) == "array")] | length),
            first_kept_compaction_count: ([$entries[] | select(.type == "compaction" and ((.firstKeptEntryId? | type) == "string"))] | length),
            branch_summary_count: ([$entries[] | select(.type == "branch_summary")] | length),
            custom_entry_types: $custom_entry_types,
            custom_entry_types_total: ($custom_type_counts | length),
            custom_entry_types_truncated: (($custom_type_counts | length) > 128),
            latest_model_change: (
              [$entries[] | select(.type == "model_change")]
              | sort_by(entry_epoch)
              | (last // null)
              | if . == null then null else {
                  entry_id: (.id | cap_required_string(256; "invalid-entry-id")),
                  timestamp: ((entry_timestamp) | cap_optional_string(128)),
                  provider: ((.provider // null) | cap_optional_string(512)),
                  model_id: ((.modelId // null) | cap_optional_string(512))
                } end
            ),
            latest_thinking_level_change: (
              [$entries[] | select(.type == "thinking_level_change")]
              | sort_by(entry_epoch)
              | (last // null)
              | if . == null then null else {
                  entry_id: (.id | cap_required_string(256; "invalid-entry-id")),
                  timestamp: ((entry_timestamp) | cap_optional_string(128)),
                  thinking_level: ((.thinkingLevel // null) | cap_optional_string(128))
                } end
            ),
            ak_task_ids: $ak_task_ids,
            ak_task_ids_total: ($task_ids_by_recency | length),
            ak_task_ids_truncated: (($task_ids_by_recency | length) > 128),
            authority_repo: $authority_repo,
            observed_mutation_roots: $observed_mutation_roots,
            observed_mutation_roots_total: ($all_observed_mutation_roots | length),
            observed_mutation_roots_truncated: (($all_observed_mutation_roots | length) > 128),
            runtime_owner: $runtime_owner,
            kes_destination: $kes_destination,
            propagation_state: $propagation_state,
            attribution_sources: {
              authority_repo: sourced_attr_string_source($attr; "authority_repo"),
              observed_mutation_roots: sourced_attr_list_source($attr; "observed_mutation_roots"),
              runtime_owner: sourced_attr_string_source($attr; "runtime_owner"),
              kes_destination: sourced_attr_string_source($attr; "kes_destination"),
              propagation_state: (
                if ($raw_propagation_state | valid_propagation_state) then
                  sourced_attr_string_source($attr; "propagation_state")
                else
                  null
                end
              )
            },
            uncertainties: $uncertainties
          }
      end
  end
