#!/usr/bin/env bash
# Run Vitest related tests for an edited source file and, on failure,
# return additional_context so the agent can see the output (postToolUse).
set -u

emit_empty() {
  printf '%s\n' '{}'
  exit 0
}

if ! command -v jq >/dev/null 2>&1; then
  emit_empty
fi

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.file_path // .tool_input.path // .tool_input.file_path // empty')

if [[ -z "$file" || "$file" == "null" ]]; then
  emit_empty
fi

# Lesson 3: scoped tests on src TypeScript, not every markdown/config edit.
if [[ "$file" != *"/src/"* && "$file" != src/* ]]; then
  emit_empty
fi
if [[ "$file" != *.ts && "$file" != *.tsx ]]; then
  emit_empty
fi

case "$file" in
  */src/db/database.types.ts | */src/vitest.d.ts) emit_empty ;;
esac

vitest_bin="./node_modules/.bin/vitest"
if [[ ! -x "$vitest_bin" ]]; then
  jq -n --arg ctx "related-tests hook: $vitest_bin is missing. Run npm install." '{additional_context: $ctx}'
  exit 0
fi

status=0
output=$("$vitest_bin" related "$file" --run 2>&1) || status=$?

if [[ "$status" -eq 0 ]]; then
  emit_empty
fi

if printf '%s' "$output" | grep -qiE 'No test files found|No related test files'; then
  emit_empty
fi

# Cursor additional_context is capped around 10_000 characters.
truncated=$(printf '%s' "$output" | head -c 9000)
jq -n --arg ctx "$truncated" '{additional_context: $ctx}'
exit 0
