# ADR 0001: Close Feedback by Patching Workflow Stage

**Date:** 2026-04-18
**Status:** Accepted

## Context

The `ub` CLI needs a `close` command that marks a feedback item as
resolved. The natural mental model from other issue trackers is a
status field with values like `open` / `closed` / `resolved`, updated
via a single field on the resource.

The Userback REST API does not work that way. The documented
`PATCH /1.0/feedback/{id}` endpoint accepts these optional fields:
`feedbackType`, `title`, `description`, `pageUrl`, `isShared`,
`allowPublicComment`, `priority`, `category`, `rating`, `assigneeId`,
`dueDate`, `notify`, and `Workflow`. There is no `status` or `state`
field. The only mechanism to mark something "closed" through the API
is to move the feedback to a workflow stage — the `Workflow` field
accepts an object with either an `id` or a `name`.

Userback workspaces define their own workflow stages. Common names
("Under Review", "Planned", "In Progress", "Shipped", "Closed",
"Will Not Do") appear in Userback's own documentation, but every
workspace can rename or reorder them. There is no guarantee that a
stage called "Closed" exists in a given workspace.

Three options were considered:

1. **Name-only, configurable.** Always send
   `{ "Workflow": { "name": X } }` where `X` defaults to `"Closed"`
   and can be overridden by the `USERBACK_CLOSED_STATUS` environment
   variable.
2. **Name or id, configurable.** Detect whether the env var is numeric
   and send either `{ "name": ... }` or `{ "id": ... }` accordingly.
3. **Resolve at runtime.** On `ub close`, first call
   `GET /1.0/workflow`, find the stage matching the configured name,
   then PATCH with the resolved id.

## Decision

Use option 1: on `ub close`, send a single PATCH with
`{ "Workflow": { "name": process.env.USERBACK_CLOSED_STATUS ?? "Closed" } }`.
No workflow lookup, no id resolution.

The default stage name is `"Closed"`. Workspaces that use a different
label set `USERBACK_CLOSED_STATUS` once, e.g.
`USERBACK_CLOSED_STATUS="Will Not Do"`.

The `Workflow` object in the API accepts id or name; if a user's
workspace has a stage they want to target by id rather than name,
they can set `USERBACK_CLOSED_STATUS` to the numeric id — the client
detects an all-digit value and sends `{ "id": N }` instead of
`{ "name": "..." }`. This is documented as an escape hatch rather
than the primary path.

## Consequences

- **Positive:** One HTTP call per close. No coupling to the workflow
  list endpoint, no caching, no pagination over workflows. The
  behavior is trivially inspectable — a user can curl the PATCH
  request and see what the CLI does.
- **Positive:** The mechanism is discoverable by reading the code;
  `USERBACK_CLOSED_STATUS` is named in the README and the error
  message surfaced on 422.
- **Neutral:** Workspaces without a "Closed" stage must set the env
  var once. This is a one-time setup cost, aligned with the
  existing pattern for `USERBACK_API_KEY` and
  `USERBACK_DEFAULT_PROJECT_ID`.
- **Negative:** If the configured stage name doesn't exist in the
  workspace, the API returns 422. The CLI surfaces the validation
  error verbatim, but the user has to read it to understand the
  fix. A runtime workflow lookup (option 3) would produce a
  friendlier "no such stage" message at the cost of complexity.
- **Negative:** "Closed" is a semantic assumption baked into a label.
  If a workspace uses a non-English language or a differently named
  stage as its terminal state, the default is wrong until the env
  var is set. This is acceptable for an MVP aimed at a single user.

## References

- Userback Update Feedback endpoint:
  <https://docs.userback.io/reference/updatefeedback>
- Userback List Workflows endpoint:
  <https://docs.userback.io/reference/listworkflows>
- Parallel decision in the sibling Ruby project
  (`/Users/jim/code/userback-ruby/docs/adr/0001-close-via-workflow-stage.md`).
