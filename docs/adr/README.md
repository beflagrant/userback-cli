# Architecture Decision Records

This directory contains ADRs — short notes capturing significant
architectural choices, the options considered, and the reasoning
behind the one we picked. They complement the code: the code tells
you *what*, the ADRs tell you *why*.

Pattern: [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-close-via-workflow-stage.md) | Close feedback by patching Workflow stage | Accepted |
| [0002](0002-esm-typescript-commander-fetch.md) | ESM + TypeScript + Commander + native `fetch` | Accepted |
| [0003](0003-output-stream-contract.md) | Output stream contract for human and JSON modes | Accepted |
| [0004](0004-package-name-and-publish-shape.md) | Package name and publish shape | Accepted |

## When to write a new ADR

Write one when you change:

- The wire protocol / output contract (stdout, stderr, exit codes,
  JSON shape).
- Runtime dependencies or Node version support.
- How the CLI authenticates or stores state.
- The command surface in a way that isn't an additive flag.

Skip it for bug fixes, refactors that don't change behavior, and
flag additions that follow existing patterns.

## How to write one

1. Copy the most recent ADR as a template.
2. Number sequentially. Don't reuse numbers.
3. Status starts `Proposed`; flip to `Accepted` at merge. Use
   `Superseded by #NNNN` instead of deleting old records — the
   history is the point.
4. Keep it under two pages. Reasoning, not tutorials.
