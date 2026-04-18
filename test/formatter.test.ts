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
