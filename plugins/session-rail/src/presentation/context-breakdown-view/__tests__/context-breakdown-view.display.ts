import assert from "node:assert/strict"
import test from "node:test"
import { presentContextBreakdown } from "../context-breakdown-view.ts"

test("見出しと各行の分母を揃え、色バーから遅延項目を除く", () => {
  const view = presentContextBreakdown({
    kind: "ready",
    group: null,
    breakdown: {
      window: 80,
      buckets: { used: 24, buffer: 8, free: 48 },
      categories: [
        { kind: "used", name: "Messages", tokens: 24 },
        { kind: "buffer", name: "Reserve", tokens: 8 },
        { kind: "free", name: "Free", tokens: 48 },
        { kind: "deferred", name: "Tool\nname", tokens: 30 },
      ],
      groups: [],
    },
  }, 10)
  assert.equal(view.overview, "推計 30% · 24 / 80 tokens")
  assert.deepEqual(view.bar, [{ kind: "used", cells: 3 }, { kind: "buffer", cells: 1 }, { kind: "free", cells: 6 }])
  assert.deepEqual(view.categories.map(({ text }) => text), ["Messages  24 · 30%", "Reserve  8 · 10%", "Free  48 · 60%"])
  assert.deepEqual(view.deferred, ["Tool�name  30"])
})

test("超過時は実際の割合を残し、色バーだけをペイン幅に収める", () => {
  const view = presentContextBreakdown({
    kind: "ready",
    group: null,
    breakdown: { window: 100, buckets: { used: 120, buffer: 15, free: 0 }, categories: [], groups: [] },
  }, 18)
  assert.equal(view.overview, "推計 120% · 120 / 100 tokens")
  assert.deepEqual(view.bar, [{ kind: "used", cells: 18 }])
})
