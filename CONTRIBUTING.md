# Contributing to userback-cli

Thanks for your interest — external contributions are welcome.

This CLI is small and intentionally so. Before you invest time, please
open an issue for anything larger than a typo or a one-line fix so we
can agree on scope. The surface area is pre-`1.0` and we'd rather
discuss trade-offs up front than ask you to redo work in review.

## Ways to contribute

- **Bug reports** — file using the
  [bug template](.github/ISSUE_TEMPLATE/bug_report.yml). Include the
  Node version, `userback-cli` version, and the full command output.
- **Feature requests** — file using the
  [feature template](.github/ISSUE_TEMPLATE/feature_request.yml).
  Explain the user problem, not the proposed solution.
- **Docs** — typo fixes and clarifications can go straight to a PR.
  Larger restructures should start as an issue.
- **Code** — follow the flow below.

## Development setup

Requires Node.js 24+ (pinned in `.nvmrc`).

```sh
git clone https://github.com/beflagrant/userback-cli
cd userback-cli
nvm use              # optional, if you use nvm
npm install
```

### Everyday commands

```sh
npm test             # full test suite (unit + subprocess)
npm run test:watch   # re-run on change
npm run typecheck    # tsc --noEmit
npm run build        # emit dist/ (needed for the post-build smoke test)
./bin/ub.js --help   # run the built CLI
```

Tests don't hit the real Userback API. The HTTP client is exercised
via [`undici`'s `MockAgent`](https://undici.nodejs.org/#/docs/api/MockAgent);
the CLI is exercised by spawning `./bin/ub.js` against a local
`node:http` server running inside the test process.

## Pull request flow

1. **Open or claim an issue** describing the change.
2. **Create a branch** from `main`.
3. **Write tests first** — the codebase is TDD'd; a PR that adds
   behavior without a failing test first is a red flag in review.
4. **Keep commits small and atomic.** Prefer "Add ub foo subcommand"
   over "WIP". The commit history is part of the documentation.
5. **Run the full gate before pushing:**
   ```sh
   npm run typecheck && npm test && npm run build
   ```
6. **Update docs in the same PR** if you change behavior. This
   includes the README, `docs/commands.md`, and — for larger
   changes — an ADR in `docs/adr/`.
7. **Open a PR** using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
   CI runs on every PR and must pass before merge.

## Commit message style

Imperative mood, under 72 characters on the first line, optional body
explaining *why*:

```
Add ub list --sort flag for chronological output

The default API order surfaces stale items first. Users pulling
feedback into a triage script want newest-first without post-hoc
sorting in jq.
```

Good recent examples live in `git log` —
`Unwrap {data: [...]} envelope from live /feedback response` and
`Default close stage to "Resolved" (ships with every Userback project)`
both pair the *what* with the *why*.

## Code style

TypeScript, ESM-only, native `fetch`, Commander 12. Two-space
indentation. See [ADR 0002](docs/adr/0002-esm-typescript-commander-fetch.md)
for the stack rationale.

- **No** new runtime dependencies without discussion in an issue.
  `undici` is dev-only (tests); the runtime depends on `commander`
  and Node built-ins and that's it.
- **No** `// TODO` left behind. If it's worth a TODO, it's worth an
  issue.
- **Tests colocated by filename:** `src/client.ts` →
  `test/client.test.ts`.
- **Output contract is law.** Any change to stdout vs stderr
  behavior or exit codes must reference
  [ADR 0003](docs/adr/0003-output-stream-contract.md) and ideally
  amend it if the contract itself is changing.

## Scope guardrails

Out of scope without an ADR:

- New runtime dependencies.
- Hitting the live Userback API in automated tests.
- Caching, persistent state, or configuration files on disk.
  `userback-cli` reads env vars and writes nothing.
- Interactive prompts. The CLI is designed to be non-interactive so
  it composes with scripts and agent workflows.

## Releasing (maintainers)

1. Bump `package.json` version.
2. Update `CHANGELOG.md` with the new section.
3. `git commit -m "Release vX.Y.Z"`
4. `git tag vX.Y.Z && git push --tags`
5. The `release.yml` workflow publishes to npm on tag push.
   Requires `NPM_TOKEN` in the repo's GitHub Actions secrets; the
   workflow also verifies the tag matches `package.json` before
   publishing with provenance.

## Code of conduct

Be kind. Assume good faith. If something feels off, email
`jim@beflagrant.com`.
