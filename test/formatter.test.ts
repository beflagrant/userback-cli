import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedbackJson,
  feedbackHuman,
  createdIdHuman,
} from "../src/formatter.js";
import type { Feedback } from "../src/client.js";

const sample: Feedback = {
  id: 42,
  projectId: 7,
  feedbackType: "Bug",
  title: "Checkout broken",
  description: "500 on submit",
  priority: "high",
  category: "billing",
  rating: "3",
  createdAt: "2026-04-10T09:00:00Z",
};

test("feedbackJson returns parseable JSON with trailing newline", () => {
  const out = feedbackJson(sample);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out);
  assert.equal(parsed.id, 42);
  assert.equal(parsed.title, "Checkout broken");
});

test("feedbackHuman renders key fields on separate lines", () => {
  const out = feedbackHuman(sample);
  assert.match(out, /id:\s+42/);
  assert.match(out, /type:\s+Bug/);
  assert.match(out, /title:\s+Checkout broken/);
  assert.match(out, /priority:\s+high/);
  assert.match(out, /created:\s+2026-04-10T09:00:00Z/);
});

test("feedbackHuman renders missing fields as em-dash", () => {
  const sparse: Feedback = { id: 1 };
  const out = feedbackHuman(sparse);
  assert.match(out, /id:\s+1/);
  assert.match(out, /type:\s+—/);
  assert.match(out, /title:\s+—/);
});

test("createdIdHuman prints just the id", () => {
  assert.equal(createdIdHuman({ id: 42 }), "42\n");
});

import { feedbackListJson, feedbackListHuman } from "../src/formatter.js";

test("feedbackListJson returns parseable JSON array with newline", () => {
  const rows: Feedback[] = [{ id: 1 }, { id: 2 }];
  const out = feedbackListJson(rows);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 1);
});

test("feedbackListJson returns [] for empty input", () => {
  const out = feedbackListJson([]);
  assert.equal(out, "[]\n");
});

test("feedbackListHuman has a header row and one row per feedback", () => {
  const rows: Feedback[] = [
    { id: 1, feedbackType: "Bug", title: "first", priority: "high", createdAt: "2026-04-01" },
    { id: 2, feedbackType: "Idea", title: "second", priority: "low", createdAt: "2026-04-02" },
  ];
  const out = feedbackListHuman(rows);
  const lines = out.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /ID/);
  assert.match(lines[0]!, /TYPE/);
  assert.match(lines[0]!, /TITLE/);
  assert.match(lines[1]!, /1/);
  assert.match(lines[1]!, /Bug/);
  assert.match(lines[1]!, /first/);
  assert.match(lines[2]!, /2/);
  assert.match(lines[2]!, /Idea/);
});

test("feedbackListHuman renders 'no feedback found' when empty", () => {
  assert.equal(feedbackListHuman([]), "no feedback found\n");
});

test("feedbackListHuman renders em-dash for missing fields in rows", () => {
  const rows: Feedback[] = [{ id: 1 }];
  const out = feedbackListHuman(rows);
  assert.match(out, /—/);
});
