#!/usr/bin/env bash
set -euo pipefail

session_root="${1:-$HOME/.pi/agent/sessions}"
output="${2:-docs/project/session-edit-failure-baseline.json}"

if [[ ! -d "$session_root" ]]; then
  printf 'Session root does not exist: %s\n' "$session_root" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
records="$work_dir/records.jsonl"
: > "$records"

while IFS= read -r -d '' session_file; do
  jq -c '
    . as $entries
    | [
        $entries[]
        | select(type == "object" and .type == "message" and .message.role == "assistant")
        | .message.content[]?
        | select(type == "object" and .type == "toolCall" and .name == "edit")
        | { id, arguments }
      ] as $calls
    | $entries
    | to_entries[]
    | .key as $result_index
    | .value
    | select(
        type == "object"
        and .type == "message"
        and .message.role == "toolResult"
        and .message.toolName == "edit"
        and .message.isError == true
      )
    | . as $result
    | ([.message.content[]? | select(type == "object" and .type == "text") | .text] | join("\n")) as $text
    | ($calls | map(select(.id == $result.message.toolCallId)) | first // null) as $call
    | ($text | capture("Found (?<count>[0-9]+) occurrences of edits\\[(?<index>[0-9]+)\\]")? // null) as $occurrence
    | ($text | capture("edits\\[(?<right>[0-9]+)\\] and edits\\[(?<left>[0-9]+)\\] overlap")? // null) as $overlap
    | (if $occurrence != null then "ambiguous_old_text"
       elif $overlap != null then "overlapping_edits"
       elif ($text | test("Could not find|not found|No match"; "i")) then "missing_old_text"
       elif ($text | test("no changes|no change|identical"; "i")) then "no_op"
       else "other"
       end) as $category
    | ($occurrence.index? // null | if . == null then null else tonumber end) as $edit_index
    | ($call.arguments.edits? // []) as $edits
    | (if $edit_index == null then null else ($edits[$edit_index] // null) end) as $selected
    | {
        dedupeKey: ($result.message.toolCallId // ($result.id // "\($source):\($result_index)")),
        timestamp: ($result.timestamp // $result.message.timestamp // null),
        category: $category,
        occurrenceCount: ($occurrence.count? // null | if . == null then null else tonumber end),
        editIndex: $edit_index,
        editCount: ($edits | length),
        oldTextChars: ($selected.oldText? // null | if . == null then null else length end),
        oldTextLines: ($selected.oldText? // null | if . == null then null else (split("\n") | length) end),
        newTextChars: ($selected.newText? // null | if . == null then null else length end),
        pathExtension: (
          ($call.arguments.path? // "")
          | tostring
          | split("/") | last
          | if . == null then "none" elif contains(".") then split(".") | last else "none" end
        )
      }
  ' --arg source "$session_file" --slurp "$session_file" >> "$records"
done < <(find "$session_root" -type f -name '*.jsonl' -print0)

jq -s '
  def counts_by($field):
    group_by(.[$field])
    | map({ key: (.[0][$field] | tostring), value: length })
    | from_entries;
  def percentile($values; $fraction):
    ($values | map(select(. != null)) | sort) as $sorted
    | if ($sorted | length) == 0 then null
      else $sorted[((($sorted | length) - 1) * $fraction | floor)]
      end;

  unique_by(.dedupeKey)
  | sort_by(.timestamp // "")
  | . as $records
  | ($records | map(select(.category == "ambiguous_old_text"))) as $ambiguous
  | ($ambiguous | counts_by("pathExtension")) as $extensions
  | {
      schemaVersion: 1,
      source: "derived from Pi session JSONL tool-result records; no source text retained",
      authority: "empirical test input only; session history is not canonical task or evidence authority",
      capturedOn: (now | strftime("%Y-%m-%d")),
      timeRangeMonths: {
        first: ($records | map(.timestamp) | map(select(. != null)) | min | .[0:7]),
        last: ($records | map(.timestamp) | map(select(. != null)) | max | .[0:7])
      },
      uniqueEditErrors: ($records | length),
      categories: ($records | counts_by("category")),
      ambiguousOccurrenceCounts: ($ambiguous | counts_by("occurrenceCount")),
      ambiguousOldText: {
        chars: {
          minimum: ($ambiguous | map(.oldTextChars) | map(select(. != null)) | min),
          median: percentile(($ambiguous | map(.oldTextChars)); 0.5),
          p90: percentile(($ambiguous | map(.oldTextChars)); 0.9),
          maximum: ($ambiguous | map(.oldTextChars) | map(select(. != null)) | max)
        },
        lines: {
          minimum: ($ambiguous | map(.oldTextLines) | map(select(. != null)) | min),
          median: percentile(($ambiguous | map(.oldTextLines)); 0.5),
          p90: percentile(($ambiguous | map(.oldTextLines)); 0.9),
          maximum: ($ambiguous | map(.oldTextLines) | map(select(. != null)) | max)
        },
        editBatchSizes: ($ambiguous | counts_by("editCount")),
        pathExtensions: (
          ($extensions | to_entries | map(select(.value >= 5)) | from_entries)
          + { other: ($extensions | to_entries | map(select(.value < 5) | .value) | add // 0) }
        )
      }
    }
' "$records" > "$output"
chmod 600 "$output"

printf 'Wrote %s\n' "$output"
