import assert from "node:assert/strict"
import test from "node:test"
import { summarizeContext } from "../../plugins/session-rail/src/domain/context-usage.ts"

test("未計測と実際の 0% を区別する", () => {
  assert.deepEqual(summarizeContext({ window: 200_000 }), { kind: "unmeasured" })
  assert.deepEqual(summarizeContext({ tokens: 0, window: 200_000, percent: 0 }), {
    kind: "ready", tokens: 0, window: 200_000, percent: 0,
  })
})

test("割合が未提供か不正なら、使用トークンとウィンドウから算出する", () => {
  const measurement = { tokens: 4, window: 7 }
  const expected = { kind: "ready", ...measurement, percent: 57 }
  assert.deepEqual(summarizeContext(measurement), expected)
  assert.deepEqual(summarizeContext({ ...measurement, percent: Number.NaN }), expected)
})

test("取得できない計測値や不正なトークン数を使用量として扱わない", () => {
  for (const measurement of [null, { tokens: -1, window: 100 }, { tokens: 10, window: 0 }]) {
    assert.deepEqual(summarizeContext(measurement), { kind: "unavailable" })
  }
})
