import assert from "node:assert/strict"
import test from "node:test"
import { ContextBreakdown, type ContextEstimate } from "../context-breakdown.ts"

const estimate: ContextEstimate = {
  window: 100,
  used: 40,
  categories: [
    { kind: "used", name: "Messages", tokens: 40 },
    { kind: "buffer", name: "Reserve", tokens: 15 },
    { kind: "free", name: "Empty", tokens: 45 },
    { kind: "deferred", name: "Delayed", tokens: 50 },
  ],
  groups: [],
}

test("カテゴリの名前でなく種別で予約・空き・遅延を区別する", () => {
  const result = ContextBreakdown.fromEstimate(estimate)
  assert.ok(result)
  assert.deepEqual(result.buckets, { used: 40, buffer: 15, free: 45 })
  assert.deepEqual(result.categories, estimate.categories)
})

test("分母や種別が分からない推計を内訳として採用しない", () => {
  for (const input of [
    null,
    { ...estimate, window: 0 },
    { ...estimate, used: Number.NaN },
    { ...estimate, categories: [] },
    { ...estimate, categories: [{ name: "Free space", tokens: 1 }] } as unknown as ContextEstimate,
  ]) {
    assert.equal(ContextBreakdown.fromEstimate(input), null)
  }
})

test("利用できる項目が一つもないグループは表示対象にしない", () => {
  const result = ContextBreakdown.fromEstimate({
    ...estimate,
    groups: [
      { kind: "mcp-tools", items: [{ name: "example", tokens: 10, deferred: true }] },
      { kind: "memory-files", items: [] },
      { kind: "agents", items: [{ name: "bad estimate", tokens: -1 }] },
    ],
  })
  assert.deepEqual(result?.groups, [
    { kind: "mcp-tools", items: [{ name: "example", tokens: 10, deferred: true }] },
  ])
})
