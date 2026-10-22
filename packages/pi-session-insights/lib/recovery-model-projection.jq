# Fixed allowlist for bounded extractor OUTPUT, not a source JSONL parser.
# Do not pass through arbitrary strings, names, IDs, paths, text or diagnostics.
def count: if type=="number" and isfinite and .>=0 and floor==. then . else null end;
def digest: if type=="string" and test("^[a-f0-9]{64}$") then . else null end;
def chain_status:
  if IN("not_requested","complete","missing_parent","invalid_parent","cycle","budget_exhausted","ambiguous_duplicate_uuids")
  then . else "unknown" end;
try (if .schema=="agent.session-recovery.claude.v1" and .ok==true then
  {schema:"agent.session-recovery.model-projection.v1", harness:"claude",
   content_included:false, source_sha256:(.custody.sha256|digest),
   coverage:{physical_lines:(.coverage.physical_lines|count), parsed_objects:(.coverage.parsed_objects|count),
     parse_errors:(.coverage.parse_errors|count), uuid_nodes:(.coverage.uuid_nodes|count),
     leaf_count:(.coverage.leaf_count|count), missing_parent_count:(.coverage.missing_parent_count|count),
     duplicate_uuid_values:(.coverage.duplicate_uuid_values|count),
     records_with_issues:(.coverage.records_with_shape_or_type_issues|count),
     unsupported_records:(.coverage.unsupported_record_count|count),
     compactions:(.coverage.compaction_records|count), tool_calls:(.coverage.tool_calls|count),
     tool_results:(.coverage.tool_results|count)},
   pagination:{page:(.pagination.page|count), page_size:(.pagination.page_size|count),
     total:(.pagination.total|count), returned:(.pagination.returned|count), next_page:(.pagination.next_page|count)},
   graph:{effective_context:"unsupported", chain_status:(.graph.chain_status|chain_status)},
   records:[.records[] | {line:(.source.line|count), uuid_present:(.source.uuid!=null),
     has_error:(.error!=null), issue_count:((.issues//[])|length),
     tool_ref_count:((.tools//[])|length), sidecar_ref_count:((.sidecars//[])|length)}],
   limitations:["private_identifiers_and_paths_omitted", "no_content_or_authority_inference",
     "counts_and_hashes_are_not_anonymization_or_completion_proof"]}
elif .schema=="pi.session-insights.v2" then
  {schema:"agent.session-recovery.model-projection.v1", harness:"pi", content_included:false,
   compaction_count:(.compaction_count|count), branch_summary_count:(.branch_summary_count|count),
   active_leaf_present:(.active_leaf!=null),
   limitations:["private_identifiers_and_paths_omitted", "no_physical_history_or_custody_fields",
     "no_content_or_authority_inference"]}
else
  error("unsupported_extractor_output")
end) catch error("invalid_extractor_output")
