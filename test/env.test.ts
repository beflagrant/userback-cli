import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDotenv, loadDotenv } from "../src/env.js";

test("parseDotenv handles KEY=value", () => {
  const out = parseDotenv("FOO=bar\nBAZ=qux");
  assert.deepEqual(out, { FOO: "bar", BAZ: "qux" });
});

test("parseDotenv skips comments and blank lines", () => {
  const out = parseDotenv("# a comment\n\nFOO=bar\n   \n# another\nBAZ=qux");
  assert.deepEqual(out, { FOO: "bar", BAZ: "qux" });
});

test("parseDotenv strips surrounding double quotes", () => {
  const out = parseDotenv('FOO="hello world"');
  assert.equal(out.FOO, "hello world");
});

test("parseDotenv strips surrounding single quotes", () => {
  const out = parseDotenv("FOO='hello world'");
  assert.equal(out.FOO, "hello world");
});

test("parseDotenv preserves an embedded equals sign in the value", () => {
  const out = parseDotenv("TOKEN=abc=def=ghi");
  assert.equal(out.TOKEN, "abc=def=ghi");
});

test("parseDotenv rejects invalid key names", () => {
  const out = parseDotenv("1BAD=x\n=nokey\nGOOD=y");
  assert.deepEqual(out, { GOOD: "y" });
});

test("parseDotenv trims whitespace around key and value", () => {
  const out = parseDotenv("  FOO  =  bar  ");
  assert.equal(out.FOO, "bar");
});

test("parseDotenv handles CRLF line endings", () => {
  const out = parseDotenv("FOO=bar\r\nBAZ=qux\r\n");
  assert.deepEqual(out, { FOO: "bar", BAZ: "qux" });
});

test("loadDotenv is a no-op when .env does not exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-env-"));
  try {
    const before = process.env.UB_TEST_ABSENT;
    loadDotenv(dir);
    assert.equal(process.env.UB_TEST_ABSENT, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadDotenv populates process.env from .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-env-"));
  try {
    writeFileSync(join(dir, ".env"), "UB_TEST_LOADED=from_dotenv\n");
    delete process.env.UB_TEST_LOADED;
    loadDotenv(dir);
    assert.equal(process.env.UB_TEST_LOADED, "from_dotenv");
  } finally {
    delete process.env.UB_TEST_LOADED;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadDotenv does not overwrite an existing process.env value", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-env-"));
  try {
    writeFileSync(join(dir, ".env"), "UB_TEST_PRECEDENCE=from_dotenv\n");
    process.env.UB_TEST_PRECEDENCE = "from_shell";
    loadDotenv(dir);
    assert.equal(process.env.UB_TEST_PRECEDENCE, "from_shell");
  } finally {
    delete process.env.UB_TEST_PRECEDENCE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadDotenv is skipped when UB_SKIP_DOTENV=1", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-env-"));
  try {
    writeFileSync(join(dir, ".env"), "UB_TEST_SKIP=from_dotenv\n");
    delete process.env.UB_TEST_SKIP;
    process.env.UB_SKIP_DOTENV = "1";
    loadDotenv(dir);
    assert.equal(process.env.UB_TEST_SKIP, undefined);
  } finally {
    delete process.env.UB_SKIP_DOTENV;
    delete process.env.UB_TEST_SKIP;
    rmSync(dir, { recursive: true, force: true });
  }
});
