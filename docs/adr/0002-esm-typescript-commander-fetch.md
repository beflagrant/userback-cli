# ADR 0002: Stack Choice — ESM + TypeScript + Commander + Native `fetch`

**Date:** 2026-04-18
**Status:** Accepted

## Context

`userback-cli` is a small Node CLI with five subcommands (`list`,
`show`, `create`, `close`, `comment`), each taking a handful of
flags. It talks to a single JSON-over-HTTPS API with Bearer-token
auth. Target runtime is Node 24 LTS. The package is published to
npm; consumers install with `npm i -g userback-cli` and invoke
`ub`.

Four coupled decisions had to be made together because they interact:

**Module system.** ESM-only, CJS-only, or dual.

**Language.** Plain JavaScript or TypeScript.

**CLI framework.** Options ranged from `node:util.parseArgs`
(stdlib, zero deps) through Commander (small, declarative) and
yargs (more features, more surface) to oclif (heavy framework
for large CLIs).

**HTTP client.** Native `fetch` (stable in Node 21+), `undici`
directly, `axios`, or `ofetch`.

The project philosophy, inherited from the sibling Ruby CLI, is
"boring and explicit over clever and abstracted." Minimal runtime
dependencies. One thing doing its job per file.

## Decision

The stack is:

1. **ESM-only.** `package.json` sets `"type": "module"`. No CJS
   build. Node 24 has first-class ESM and a CLI binary is not
   imported by downstream `require()` callers.
2. **TypeScript.** Source in `src/*.ts`, compiled by `tsc` to
   `dist/*.js` + `dist/*.d.ts` at publish time. Tests run TS
   directly via `tsx`. The published package contains only `dist/`,
   `bin/`, `README.md`, and `LICENSE` — consumers need no TS
   toolchain.
3. **Commander** as the CLI framework (runtime dep, `^12`).
4. **Native `fetch`** as the HTTP client (stdlib since Node 21,
   stable). No runtime HTTP dep.

## Consequences

### Positive

- **One runtime dependency.** Commander is the only non-stdlib
  runtime import. Install footprint stays tiny; audit surface
  stays small.
- **Types catch API drift early.** The Userback API docs don't
  fully specify response shapes (see `docs/superpowers/specs/...`,
  "Assumptions requiring verification"). Defining response types
  in `client.ts` means any divergence becomes a compile error at
  the boundary, not a runtime explosion deep in the formatter.
- **Modern defaults.** Top-level `await` in tests, `import`
  syntax throughout, native `fetch` with `Request`/`Response`
  primitives. No syntactic compromises for compatibility we
  don't need.
- **Fast dev loop.** `tsx` runs tests straight off TS source
  with no explicit compile step. `node:test` starts in
  milliseconds.

### Neutral

- **Build step exists.** `tsc` runs on `prepublishOnly`, so the
  publish artifact diverges from the source tree. Developers
  working in-repo run via `tsx`; consumers run compiled `dist/`.
  This is the conventional shape for TS-authored Node CLIs.
- **ESM requires explicit `.js` extensions in imports.** Minor
  friction. `tsc` handles it via `"moduleResolution": "NodeNext"`.

### Negative

- **Three config files earn their weight.** `tsconfig.json`,
  `package.json` build/test scripts, and the ESM-vs-CJS-naming
  pedantry (imports must end in `.js` even though sources are
  `.ts`). Plain JS wouldn't need any of that.
- **TypeScript is a language choice, not just a typechecker.** If
  the project ever grows contributors who don't know TS, there's
  a learning tax. Acceptable: the primary author works with TS
  daily and the secondary caller is an LLM, which handles TS fine.
- **If API response shapes turn out to be wildly dynamic (fields
  appearing and disappearing), strict types will get in the way.**
  Mitigation: response types use `?`-optional fields liberally and
  an `extra?: unknown` escape hatch on objects we read partially.

## Alternatives considered

- **Plain JavaScript + Commander + native `fetch`.** Strips the TS
  config overhead. Rejected because the response-shape uncertainty
  is exactly where types are most valuable, and the `tsx`-based
  dev loop removes the "slow iteration" argument against TS.
- **`node:util.parseArgs` instead of Commander.** Zero deps; but
  five subcommands × several flags is enough boilerplate that a
  tiny framework pays off. Same reasoning as the Ruby project's
  choice of Thor over stdlib `OptionParser`.
- **`axios` or `ofetch` instead of native `fetch`.** `axios` brings
  ~400 KB and an old API; `ofetch` is tidier but carries more
  opinions (auto-throw on 4xx, retries). The HTTP surface here is
  so small that hand-writing a 20-line wrapper around `fetch` is
  cleaner than inheriting anyone else's defaults.
- **oclif.** Over-engineered for five commands. Rejected on sight.

## References

- Commander: <https://github.com/tj/commander.js>
- MDN Fetch in Node: <https://nodejs.org/api/globals.html#fetch>
- `tsx`: <https://github.com/privatenumber/tsx>
- `node:test`: <https://nodejs.org/api/test.html>
