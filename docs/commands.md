# Command Reference

Every `ub` command accepts `--json` for machine-readable output, `--help`
for the canonical flag list, and returns an
[exit code from the standard table](../README.md#exit-codes).

For the output shape of each command in `--json` mode, see
[json-contract.md](json-contract.md).

- [`ub show`](#ub-show)
- [`ub list`](#ub-list)
- [`ub create`](#ub-create)
- [`ub close`](#ub-close)
- [`ub comment`](#ub-comment)
- [`ub projects list`](#ub-projects-list)
- [`ub projects show`](#ub-projects-show)

---

## `ub show`

Fetch a single feedback item by numeric id.

```text
ub show <feedbackId> [--json]
```

### Arguments

| Arg | Required | Description |
|---|---|---|
| `<feedbackId>` | yes | Positive integer id of the feedback item. |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Emit JSON instead of a human-readable block. |

### Example

```sh
ub show 1234
ub show 1234 --json | jq '{id, title, priority}'
```

### Exit codes

| Code | When |
|---|---|
| `0` | Found, printed. |
| `2` | `<feedbackId>` not a positive integer. |
| `3` | Token rejected (`401`). |
| `4` | No feedback with that id (`404`). |
| `7` | Network error. |

---

## `ub list`

List feedback items, one API page per invocation.

```text
ub list [--json] [--limit N] [--type TYPE] [--project-id ID] [--status NAME]
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Emit JSON instead of the padded table. |
| `--limit <n>` | `25` | Page size. Clamped to the API maximum of `50`; a warning goes to stderr in human mode. |
| `--type <type>` | — | Filter to `General`, `Bug`, or `Idea`. Composes as `feedbackType eq 'X'`. |
| `--project-id <id>` | — | Filter to a specific project id. Composes as `projectId eq N`. |
| `--status <name>` | — | Filter by workflow stage name. Composes as `Workflow/name eq 'X'` with OData string escaping. |

Filters are combined with OData `and`. If you need a filter shape we
don't expose, [file an issue](https://github.com/beflagrant/userback-cli/issues/new/choose).

### Examples

```sh
ub list --type Bug --limit 10
ub list --status "In Progress" --json | jq 'length'
ub list --project-id 7 --type Idea
```

### Exit codes

Same table as `ub show`, plus `2` on an invalid `--type`, `--limit`,
or `--project-id` value.

---

## `ub create`

File a new feedback item.

```text
ub create --title "..." --body "..." [--type TYPE] [--priority LEVEL]
          [--project-id ID] [--email EMAIL] [--json]
```

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--title <title>` | yes | — | Feedback title. |
| `--body <body>` | yes | — | Feedback description. |
| `--type <type>` | no | `General` | One of `General`, `Bug`, `Idea`. |
| `--priority <level>` | no | — | One of `low`, `neutral`, `high`, `urgent`. |
| `--project-id <id>` | yes\* | — | Numeric project id. Falls back to `USERBACK_DEFAULT_PROJECT_ID`. |
| `--email <email>` | yes\* | — | Submitter email. Falls back to `USERBACK_DEFAULT_EMAIL`. |
| `--json` | no | off | Emit the full created record instead of just the new id. |

\* "Required" means "required at the flag *or* env var level".

### Example

```sh
ub create \
  --title "Checkout returns 500" \
  --body "Repro: add item, click Pay, see spinner forever" \
  --type Bug \
  --priority high
```

Human mode prints just the new id (`42`) so shell usage is trivial:

```sh
id=$(ub create --title "..." --body "...")
ub close "$id"
```

### Exit codes

Same as `ub show`, plus `2` on invalid `--type` / `--priority` and
missing project id or email.

---

## `ub close`

Advance a feedback item to a workflow stage (by default, `Resolved`)
and optionally post a comment in the same invocation.

```text
ub close <feedbackId> [--comment "..."] [--json]
```

### Arguments

| Arg | Required | Description |
|---|---|---|
| `<feedbackId>` | yes | Positive integer id. |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--comment <text>` | — | If set, POST a comment after closing. |
| `--json` | off | Emit `{"closed": true, "id": N}` or an error envelope. |

### Target stage

By default, `ub close` sends `{"Workflow": {"name": "Resolved"}}`.
Override with `USERBACK_CLOSED_STATUS`:

```sh
export USERBACK_CLOSED_STATUS="Will Not Do"   # by name
export USERBACK_CLOSED_STATUS="9"             # numeric id
```

The full rationale is in
[ADR 0001](adr/0001-close-via-workflow-stage.md).

### Partial-success semantics

If the PATCH succeeds but the comment fails, `ub close` exits `6`
and reports the partial success on stderr (human mode) or via a
combined JSON envelope (JSON mode). The close itself is not rolled
back.

### Example

```sh
ub close 1234 --comment "Fixed in deploy 2026-04-19"
```

---

## `ub comment`

Post a comment on a feedback item.

```text
ub comment <feedbackId> --body "..." [--json]
```

### Arguments

| Arg | Required | Description |
|---|---|---|
| `<feedbackId>` | yes | Positive integer id. |

### Flags

| Flag | Required | Description |
|---|---|---|
| `--body <text>` | yes | Comment body. |
| `--json` | no | Emit the full created comment instead of just its id. |

### Example

```sh
ub comment 1234 --body "Reproduced on Safari 17.4"
```

### Known limitation

The `isPublic` flag is not currently exposed; the API default applies.
[Issue welcome](https://github.com/beflagrant/userback-cli/issues/new/choose)
if you need it.

---

## `ub projects list`

List the projects visible to your API token.

```text
ub projects list [--json]
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Emit JSON instead of the padded table. |

### Example

```sh
ub projects list
# ID          NAME                                      TYPE        ARCHIVED
# 139657      My first project                          feedback    false
```

The API returns a `{"data": [...]}` envelope that the CLI unwraps; you
always see a plain array in `--json` mode.

### Exit codes

Same as the other list commands — `0` on success, `3` on bad token,
`7` on network failure.

---

## `ub projects show`

Show one project, including its member list.

```text
ub projects show <projectId> [--json]
```

### Arguments

| Arg | Required | Description |
|---|---|---|
| `<projectId>` | yes | Positive integer project id (from `ub projects list`). |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Emit JSON instead of a human-readable block. |

### Example

```sh
ub projects show 139657
# id:         139657
# name:       My first project
# type:       feedback
# archived:   false
# created:    2026-04-18T17:01:38.000Z
# createdBy:  106367
#
# members:
#   - Jim Remsik <jim@beflagrant.com> (Admin)
```

### Known limitation

The `/project` list endpoint returns an empty `Members` array; the
per-project `/project/:id` endpoint populates it. Use `projects show`
when you need membership detail.
