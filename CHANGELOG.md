# Changelog

All notable changes to `userback-cli` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

Each released version has a git tag (`vX.Y.Z`) and a GitHub release
with notes derived from this file.

## [Unreleased]

### Added

- `ub projects list` and `ub projects show <id>` for discovering
  projects in a workspace, including member lists. Closes the
  "how do I find my `USERBACK_DEFAULT_PROJECT_ID`?" gap.
- Automatic `.env` loading from the current working directory. Real
  environment variables take precedence. No new runtime dependencies
  — parser lives in `src/env.ts`.
- `CONTRIBUTING.md`, `SECURITY.md`, and this changelog.
- Issue templates (bug / feature / question) and PR template under
  `.github/`.
- Expanded docs under `docs/`:
  [commands](docs/commands.md),
  [recipes](docs/recipes.md),
  [ci-examples](docs/ci-examples.md),
  [troubleshooting](docs/troubleshooting.md),
  [json-contract](docs/json-contract.md).

## [0.1.0] — Unreleased

Initial pre-release. Not yet published to npm.

### Added

- `ub show <id>` — fetch a single feedback item in human or JSON
  form.
- `ub list` — list feedback with `--limit`, `--type`, `--project-id`,
  `--status` filters; OData composition.
- `ub create` — file new feedback with required `--title` / `--body`
  and optional `--type`, `--priority`.
- `ub close <id>` — advance workflow stage (defaults to `Resolved`),
  optional `--comment` in the same command.
- `ub comment <id> --body "..."` — post a comment.
- `--json` on every command, with a stable error envelope
  (see [ADR 0003](docs/adr/0003-output-stream-contract.md)).
- Typed error hierarchy mapping to exit codes 0–7.
- GitHub Actions CI running typecheck, test, build, and a
  `npm pack --dry-run` tarball check.
- Four ADRs documenting the stack, output contract, close mechanism,
  and publishing model.

[Unreleased]: https://github.com/beflagrant/userback-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/beflagrant/userback-cli/releases/tag/v0.1.0
