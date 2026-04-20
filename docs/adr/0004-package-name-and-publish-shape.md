# ADR 0004: Package Name `userback-cli`, Binary `ub`, Publish Compiled `dist/`

**Date:** 2026-04-18
**Status:** Accepted

## Context

Three coupled naming and packaging decisions had to be made:

1. **Package name.** The natural choice `userback` is already
   taken on npm (a 2018 package, last modified 2023, owner not
   clearly identified but at minimum a squatter risk — see
   <https://registry.npmjs.org/userback>). Publishing under
   that name would either require a takeover request or
   collision with whatever that package is. Userback the
   company also publishes JavaScript integrations and may use
   the bare name or a scoped name for their SDK.
2. **Binary name.** The CLI is invoked as `ub`. Users type it
   interactively; LLM agents invoke it in shells. Short is
   worth protecting.
3. **Publish shape.** TypeScript source in `src/*.ts` must be
   compiled to JavaScript before it runs under plain `node`.
   The question is what ends up in the npm tarball: source,
   compiled output, or both; and how the compiled output is
   shaped (one bundle vs. a tree of files).

## Decision

**Package name: `userback-cli`.** Confirmed available on npm as
of 2026-04-18 (registry returns 404). Convention: `-cli` suffix
clearly distinguishes a CLI package from its sibling SDK (see
`gh`, `vercel-cli`, `netlify-cli`, `@supabase/cli`).

**Binary name: `ub`.** `package.json#bin` maps `"ub"` to
`"./bin/ub.js"`. The install command is
`npm i -g userback-cli`; the invoke command is `ub`. These
names need not match and don't.

**Publish shape:** Compile at publish time; ship compiled output
only.

- `src/*.ts` → `dist/*.js` + `dist/*.d.ts` via plain `tsc`.
- `bin/ub.js` is authored as plain JavaScript (not TypeScript)
  so it works under `node` with no toolchain; it dynamic-imports
  the compiled `dist/cli.js` and calls its exported `run()`.
- `package.json#files` limits the tarball to `dist/`, `bin/`,
  `README.md`, and `LICENSE`. Source, tests, and config do not
  ship.
- No bundler. Plain `tsc` emit. If startup time or install size
  ever justifies bundling, the choice is revisitable in one
  file.
- `package.json#engines.node` is `">=24"`. We target Node 24
  LTS and don't pretend to support older releases.

## Consequences

### Positive

- **No name collision.** `userback-cli` is unambiguously this
  project. Users searching npm for "userback" find the company's
  work (whoever owns that name) and this package side-by-side
  without confusion.
- **Short interactive name preserved.** `ub` is what you type.
  The package-vs-binary split is a normal Node convention and
  doesn't surprise anyone.
- **Clean tarball.** Consumers download only compiled JS and
  type definitions. No source, no tests, no build config
  cluttering `node_modules/userback-cli/`.
- **Programmatic reuse is possible later without rework.** The
  compiled `dist/` tree already includes `.d.ts` files; if we
  later decide to expose a public API, adding an `exports`
  entry is a one-line change. This matches the user's intent
  ("strictly CLI, we could always add that later").

### Neutral

- **Shebang file is JS, not TS.** `bin/ub.js` is two lines of
  hand-written JavaScript. Keeping it out of TS compilation
  avoids a chicken-and-egg where the binary needs to resolve
  its own compiled path.

### Negative

- **Install name differs from invoke name.** Someone who sees
  `ub` in a shell transcript has to know the package is
  `userback-cli` to install it. Mitigation: `ub --version`
  prints the package name, and the README opens with the
  install command.
- **Re-publishing under `userback` (bare) is permanently
  blocked** unless the squatter is reclaimed. We don't plan to
  re-publish, so this cost is nominal.
- **Node 24+ only.** Users on older Node cannot install. This
  is a conscious choice to keep the code modern rather than
  carry compatibility shims for runtimes we're not using. The
  `engines` field enforces it rather than silently breaking on
  install.

## References

- ADR 0002 for language and runtime choices that feed this.
- npm naming guidance: <https://docs.npmjs.com/package-name-guidelines>
- `package.json#bin` docs:
  <https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin>
