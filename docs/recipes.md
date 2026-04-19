# Recipes

Real-world scripting patterns that chain `ub` commands with `jq`,
`xargs`, and plain shell. Every recipe below is copy-paste ready;
substitute your own ids and filters.

- [Nightly bug export to JSON](#nightly-bug-export-to-json)
- [Triage: show me all urgent untriaged bugs](#triage-show-me-all-urgent-untriaged-bugs)
- [Bulk close items matching a filter](#bulk-close-items-matching-a-filter)
- [File a bug from a failing CI job](#file-a-bug-from-a-failing-ci-job)
- [Pipeline-safe error handling](#pipeline-safe-error-handling)
- [Agent workflow: summarize open bugs](#agent-workflow-summarize-open-bugs)

---

## Nightly bug export to JSON

Dump the 50 most-recent bugs to a file, timestamped, for archival or
analytics:

```sh
stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
ub list --type Bug --limit 50 --json > "bugs-${stamp}.json"
```

If you need more than 50 (the API cap per page), loop pages yourself.
`ub list` intentionally stays as a single-page primitive — see
[ADR 0002](adr/0002-esm-typescript-commander-fetch.md).

---

## Triage: show me all urgent untriaged bugs

```sh
ub list --type Bug --status "New" --json \
  | jq '[.[] | select(.priority == "urgent")] | sort_by(.created)'
```

Read as "fetch, filter client-side on priority, sort by created
ascending". `jq`'s `select` is usually more flexible than adding more
flags to `ub list`.

---

## Bulk close items matching a filter

Close every item in `In QA` that hasn't been touched in 30 days.
This reads ids from `ub list`, then closes each with `xargs`:

```sh
ub list --status "In QA" --limit 50 --json \
  | jq -r --arg cutoff "$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ)" \
      '.[] | select(.modified < $cutoff) | .id' \
  | xargs -I {} ub close {} --comment "Auto-closed after 30d in QA"
```

`-v-30d` is BSD `date` (macOS). On GNU `date`, use
`$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)`.

`xargs -I {}` runs one `ub close` per id, so a failure on one id
doesn't abort the batch — but nothing aggregates the exit codes
either. For stricter behavior, loop manually and track failures:

```sh
failed=0
while read -r id; do
  ub close "$id" --comment "Auto-closed after 30d in QA" || failed=$((failed+1))
done < <(ub list --status "In QA" --json | jq -r '.[].id')
echo "failed: $failed"
```

---

## File a bug from a failing CI job

Inside a CI script, capture the failing command's output and file a
Userback bug automatically:

```sh
if ! npm test > test.log 2>&1; then
  title="CI failed on $(git rev-parse --short HEAD)"
  body=$(printf 'Branch: %s\nCommit: %s\n\nTail of test.log:\n%s' \
    "$GITHUB_REF_NAME" \
    "$GITHUB_SHA" \
    "$(tail -n 40 test.log)")
  ub create --title "$title" --body "$body" --type Bug --priority high
  exit 1
fi
```

`ub create` prints only the new id in human mode, so you can log it:

```sh
id=$(ub create --title "..." --body "...")
echo "filed userback #$id"
```

---

## Pipeline-safe error handling

In JSON mode, errors go to `stdout` too, so `| jq` never sees an
empty stream. Use the exit code to branch:

```sh
if out=$(ub show 1234 --json); then
  echo "$out" | jq .title
else
  code=$?
  echo "$out" | jq -r '.error.kind'   # "not_found", "unauthorized", …
  exit $code
fi
```

See [docs/json-contract.md](json-contract.md) for the full error
envelope shape.

---

## Agent workflow: summarize open bugs

Give an LLM agent the bug list and ask for a summary. The `--json`
output is stable and token-efficient:

```sh
ub list --type Bug --status "New" --limit 50 --json \
  | jq '[.[] | {id, title, priority, created}]' \
  | claude -p "Group these Userback bugs by likely root cause. Call out any with priority=urgent."
```

Swap `claude` for `gh copilot explain`, `ollama run`, or your tool of
choice — the point is `ub list --json` gives you a well-typed input.
