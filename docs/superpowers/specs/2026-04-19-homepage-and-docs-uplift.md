# `userback-cli` — Homepage & Docs Uplift (GitHub-native)

**Date:** 2026-04-19
**Scope:** Rebuild the GitHub "home page" experience (the rendered README,
plus the supporting repo files that show up alongside it) for an
open-source developer audience. No standalone website. No marketing
template. Everything lives in the repo and renders on GitHub.

**Anchored on:** `README.md`, `package.json` (v0.1.0, bin `ub`, deps
`commander@^12`), [src/cli.ts](../../../src/cli.ts) (commands:
`show`, `list`, `create`, `close`, `comment`),
[src/client.ts](../../../src/client.ts) (typed error hierarchy:
`UserbackError` → `ConfigError | NetworkError | HTTPError` →
`UnauthorizedError | NotFoundError | ValidationError | ServerError`),
[src/formatter.ts](../../../src/formatter.ts), the four ADRs in
[docs/adr/](../../adr/), and current git history (18 feature commits,
no tags yet).

---

## 1. Homepage strategy

The "homepage" is the rendered `README.md` shown on
`github.com/beflagrant/userback-cli`. GitHub gives us four
above-the-fold affordances to design around:

1. The repo title, description, and topics (from the sidebar)
2. The social preview image
3. The README body
4. The "About" sidebar links (homepage URL, releases, packages)

**Audience:** OSS developers who landed from a link, an `npm search`,
or a Userback support reply. They want to know in 10 seconds: *does
this do what I need, and can I run it now?*

**Design principles:**

- **Restrained, OSS-native.** No hero graphic, no pricing table, no
  "trusted by" logos. Badges, a one-line pitch, a code block, and the
  command table. Anything flashier reads as marketing and erodes
  trust on `npmjs.com`.
- **Install and first-use above the fold.** The first code block
  should be runnable. The second should be a command that prints a
  real result. Anything between them is friction.
- **Commands as the primary artifact.** This is a CLI — the fastest
  path to comprehension is seeing the commands, their flags, and the
  output shape. Prose supports the commands, not the other way around.
- **Failure modes are content, not an appendix.** Exit codes and a
  troubleshooting section belong in the main flow. A CLI users can't
  debug is worse than one they never install.
- **Copy-paste first.** Every example should work if pasted as-is
  (modulo the reader's API key). No `<PLACEHOLDER>` mid-command, no
  truncated output, no "adjust as needed" asides.
- **Honest about maturity.** At `0.1.0` with no tags, we say so. The
  "Stability" callout sets expectations; the alternative is a review
  from someone who expected 1.0 polish.

**What we are explicitly not doing:**

- A docs website (mkdocs, Docusaurus, etc.). Premature at this size.
- A logo or custom banner. The `ub` command *is* the brand.
- Animated GIF demos. They bloat the README and rot when flags
  change.
- A "Why another CLI?" section. Nobody asked.

---

## 2. Final README copy (structure + exact text)

This is the section-by-section spec for the rewritten README. The
current `README.md` already implements most of it after the
2026-04-19 rewrite (commit `da9e16c`); this document is the
canonical version and the diff targets below are small.

**Title row**

```
# userback-cli

[CI badge] [npm badge] [Node badge] [License badge]
```

**Pitch (2 sentences, under the badges)**

> A friendly command-line interface for the
> [Userback](https://userback.io) REST API. List feedback, file bugs,
> post comments, and close items — all from your terminal or a shell
> pipeline.

**Showcase block (first code fence)**

```sh
ub list --type Bug --limit 5
ub create --title "Checkout is broken" --body "500 on submit"
ub close 1234 --comment "Fixed in deploy 2026-04-19"
```

**One-sentence DX claim (after the showcase)**

> Every command supports `--json` for machine-readable output, exit
> codes are stable per error class, and the binary is small enough to
> drop into CI or an LLM-driven agent workflow.

**Stability callout (new — add this)**

> **Status:** Early. `userback-cli` is `0.1.0`, pre-first-release.
> The command set and flags are intentionally small and the output
> contract is stable (see [ADR 0003](docs/adr/0003-output-stream-contract.md)),
> but expect additive changes before `1.0`. File issues — every
> report during the pre-1.0 window shapes the final surface.

**Table of contents** — keep current.

**Sections, in order:**

1. Quick start (3 copy-paste steps)
2. Installation (global / per-project / one-shot `npx`)
3. Authentication (env vars table + how to get the key)
4. Commands (signature block, one table line per command)
5. Examples (one h3 per recipe, each with a copy-paste block)
6. JSON mode and exit codes (streams, envelope, code table, shell
   dispatch example)
7. How `ub close` works (links ADR 0001)
8. Troubleshooting (error-first: six common messages, what they mean,
   how to fix)
9. Development (clone, test, typecheck, build, project layout)
10. Design decisions (one-paragraph pointer to `docs/adr/`)
11. Contributing (pointer to `CONTRIBUTING.md`)
12. License

The current `README.md` (after `da9e16c`) implements 1–12 except the
**Stability callout** and the **Contributing pointer** linking a new
`CONTRIBUTING.md`. Those are the only two README diffs needed; see
§5.

**GitHub sidebar settings (one-time, not a README change)**

| Field | Value |
|---|---|
| Description | `Command-line tool for the Userback REST API. Install as userback-cli, invoke as ub.` |
| Website | (leave blank — no site yet) |
| Topics | `userback`, `cli`, `feedback-api`, `typescript`, `nodejs`, `devtools`, `llm-tools` |
| Releases | Publish `v0.1.0` once npm publish happens |
| Packages | Surfaces the npm link automatically after first publish |

---

## 3. Documentation information architecture

All documentation lives in the repo. No site generator. Files render
on GitHub and are editable via PR. This is the target tree; ⭐ marks
net-new files.

```text
README.md                               # homepage
CONTRIBUTING.md                  ⭐     # how to propose changes
CODE_OF_CONDUCT.md               ⭐     # Contributor Covenant v2.1
CHANGELOG.md                     ⭐     # human-curated, Keep a Changelog
SECURITY.md                      ⭐     # how to report vulns
LICENSE                                 # MIT

docs/
  commands.md                    ⭐     # full per-command reference
  recipes.md                     ⭐     # copy-paste scripting patterns
  ci-examples.md                 ⭐     # GitHub Actions / GitLab CI / Make
  completions.md                 ⭐     # shell completion install (once shipped)
  troubleshooting.md             ⭐     # expanded from README
  json-contract.md               ⭐     # canonical output/error envelope spec
  adr/
    0001-close-via-workflow-stage.md
    0002-esm-typescript-commander-fetch.md
    0003-output-stream-contract.md
    0004-package-name-and-publish-shape.md
    README.md                    ⭐     # index + "what is an ADR"
  superpowers/
    specs/ …                            # design notes, existing
    plans/ …                            # implementation plans, existing

.github/
  ISSUE_TEMPLATE/
    bug_report.yml               ⭐
    feature_request.yml          ⭐
    question.yml                 ⭐
    config.yml                   ⭐
  PULL_REQUEST_TEMPLATE.md       ⭐
  workflows/
    ci.yml                              # exists
    release.yml                  ⭐     # future: publish on tag
    codeql.yml                   ⭐     # GitHub's default JS/TS config
```

**Reading paths (by reader intent):**

- *"I want to try it"* → README Quick start.
- *"What does flag X do?"* → `docs/commands.md`.
- *"How do I use it in a nightly script?"* → `docs/recipes.md` +
  `docs/ci-examples.md`.
- *"It errored, what does that mean?"* → README Troubleshooting →
  `docs/troubleshooting.md`.
- *"Why does `close` work that way?"* → `docs/adr/0001-…`.
- *"I want to contribute"* → `CONTRIBUTING.md` → `docs/adr/README.md`.

**Rule of thumb for README vs docs/ split:** if a reader needs it to
run the tool successfully in the first 10 minutes, it belongs in the
README. Everything else links out.

---

## 4. Prioritized DX recommendations

Grouped P0/P1/P2 by what most improves the first-run experience.
Each item: *what*, *why*, and *concrete next step*.

### P0 — before public launch

1. **Ship `v0.1.0` to npm and tag the release.**
   *Why:* The README badges for npm and Node version render as 404 until
   the package exists. The `gh release` page is the canonical "what's in
   this version" for most adopters.
   *Next:* `npm publish` + `git tag v0.1.0 && git push --tags`, then
   write `CHANGELOG.md` entry.

2. **Add `CONTRIBUTING.md` and link it from the README.**
   *Why:* External contributors hit "how do I run tests, what's the
   commit style, what's in scope" before they open a PR. Current
   README has a one-liner; that's not enough.
   *Next:* File delivered in §5.

3. **Add `SECURITY.md`.**
   *Why:* GitHub shows a "Security policy" tab that 404s without
   this file. For a tool that handles an API token, a stated disclosure
   path is table stakes.
   *Next:* File delivered in §5.

4. **Add issue templates and PR template.**
   *Why:* Untemplated bug reports cost a round-trip to ask for version,
   Node version, and the full error. Templates front-load that ask.
   *Next:* Files delivered in §5.

5. **Expand the troubleshooting section into `docs/troubleshooting.md`.**
   *Why:* The six-error list in the README is the most valuable
   content for users who hit problems. Giving it a dedicated page
   makes it linkable from error messages ("see
   https://github.com/beflagrant/userback-cli/blob/main/docs/troubleshooting.md#e-422").

### P1 — shortly after launch

6. **Add `docs/commands.md` — the full command reference.**
   *Why:* The README's command block is the signature; users filing
   real bugs want every flag, every env-var interaction, every exit
   code per command.
   *Next:* File delivered in §5.

7. **Add `docs/recipes.md`.**
   *Why:* The hardest thing about a CLI is figuring out how to *chain*
   it. Show the three or four patterns that cover 80% of use
   (nightly bug export, triage script, close-old-items cleanup,
   GitHub Action).
   *Next:* File delivered in §5.

8. **Add `docs/ci-examples.md`.**
   *Why:* "How do I use this in GitHub Actions" is the #1 adoption
   question for any CLI. A copy-paste workflow file shortcuts it.
   *Next:* File delivered in §5.

9. **Add `docs/json-contract.md`.**
   *Why:* ADR 0003 explains *why* we do stream splitting; this is the
   *what* an integrator needs — the exact JSON shape of each command's
   success response and the error envelope, with examples.
   *Next:* File delivered in §5.

10. **Add `CHANGELOG.md` (Keep a Changelog format).**
    *Why:* Tagged releases + CHANGELOG = the bar people expect. The
    `gh release` body can reference it.
    *Next:* File delivered in §5.

11. **Wire `release.yml` that publishes on tag push.**
    *Why:* Removes the "did we publish?" ambiguity and makes `v*` tags
    the source of truth.
    *Next:* File delivered in §5.

### P2 — post-adoption polish

12. **Shell completions (`ub completion bash|zsh|fish`).**
    *Why:* The #1 thing that makes a CLI feel finished. Commander
    doesn't ship completions; implement via
    [`@commander-js/extra-typings`](https://www.npmjs.com/package/@commander-js/extra-typings)
    or hand-rolled static scripts in `completions/`.
    *Next:* New issue "Add shell completions"; track as its own plan.

13. **Versioned docs via tagged snapshots.**
    *Why:* Once we have `v1.x` and `v2.x`, `main` docs drift from
    what users on old versions installed. GitHub supports this
    naturally: link to docs at a specific tag
    (`/blob/v1.2.0/docs/commands.md`) from the release body.
    *Next:* Add a "Docs for this release" line to the release
    template once the first tag lands. No extra tooling needed.

14. **`CODEOWNERS` and `.github/codeql.yml`.**
    *Why:* Once there's more than one maintainer, review routing and
    SAST coverage become cheap wins.
    *Next:* Add on first external PR merge.

15. **Man page (`man ub`).**
    *Why:* Some users grep `man` before README. Generatable from
    Commander's `--help` via `help2man`.
    *Next:* Defer until post-1.0.

16. **Progress / retry on 429.**
    *Not a docs issue, but showed up in ADR 0001's assumptions list.*
    The README currently documents "429 exits 6". A retry with
    backoff would be a nicer default.
    *Next:* New issue.

---

## 5. Files to add (delivered alongside this spec)

All files are created as part of this work. Paths are absolute in
the repo.

| Path | Purpose | Status |
|---|---|---|
| [CONTRIBUTING.md](../../../CONTRIBUTING.md) | How to propose changes | ⭐ new |
| [SECURITY.md](../../../SECURITY.md) | Vuln disclosure policy | ⭐ new |
| [CHANGELOG.md](../../../CHANGELOG.md) | Keep a Changelog format | ⭐ new |
| [docs/commands.md](../../commands.md) | Full command reference | ⭐ new |
| [docs/recipes.md](../../recipes.md) | Scripting patterns | ⭐ new |
| [docs/ci-examples.md](../../ci-examples.md) | CI integrations | ⭐ new |
| [docs/troubleshooting.md](../../troubleshooting.md) | Expanded error guide | ⭐ new |
| [docs/json-contract.md](../../json-contract.md) | Output shape spec | ⭐ new |
| [docs/adr/README.md](../../adr/README.md) | ADR index | ⭐ new |
| [.github/ISSUE_TEMPLATE/bug_report.yml](../../../.github/ISSUE_TEMPLATE/bug_report.yml) | Structured bug form | ⭐ new |
| [.github/ISSUE_TEMPLATE/feature_request.yml](../../../.github/ISSUE_TEMPLATE/feature_request.yml) | Structured feature form | ⭐ new |
| [.github/ISSUE_TEMPLATE/config.yml](../../../.github/ISSUE_TEMPLATE/config.yml) | Disable blank issues | ⭐ new |
| [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) | PR checklist | ⭐ new |

The README itself already reflects the new copy as of commit
`da9e16c`; the only remaining README diffs are the **Stability
callout** and a **Contributing pointer**. Those are applied in this
same change.

---

## 6. Out of scope (explicit)

- Standalone website / docs generator.
- Custom logo, banner, animated demo.
- Translations.
- `CODE_OF_CONDUCT.md` — deferred until there are enough
  contributors to need moderation. Adding one prematurely is worse
  than not having one.
- `CODEOWNERS`, `codeql.yml` — deferred (P2).
