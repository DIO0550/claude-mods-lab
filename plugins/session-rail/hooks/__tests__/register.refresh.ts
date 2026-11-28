import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import type { SessionUsage } from "claude-code"
import { CWD, PANE_ID, harness } from "./support/rail-harness.ts"

test("メインのターン終了時にだけ、開いているペインを更新する", async () => {
  const { api, fire, render } = harness()
  await fire("turn.complete", {})
  await setImmediate()
  assert.deepEqual(api.gitCalls, [])
  await fire("command.run", {})
  await setImmediate()

  api.sessionState.usage = { tokens: 0, window: 200_000, percent: 0 }
  await fire("turn.complete", { agentId: "subagent" })
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  21%"))
  await fire("turn.complete", {})
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  0%"))
})

test("閉じる前の遅い取得結果を、新しく開いたペインへ渡さない", async () => {
  const { api, fire, render } = harness()
  const delayed = Promise.withResolvers<SessionUsage>()
  const readUsage = api.session.usage
  api.session.usage = () => delayed.promise
  await fire("command.run", {})
  await setImmediate()
  api.openPanes.delete(PANE_ID)
  await fire("ui.close", { id: PANE_ID })
  api.session.usage = readUsage
  api.sessionState.usage = { tokens: 60_000, window: 200_000, percent: 30 }
  await fire("command.run", {})
  await setImmediate()

  delayed.resolve({ startedAt: 0, rateLimits: [], context: { tokens: 1, window: 100, percent: 1 } })
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  30%"))
  assert.deepEqual(api.redraws, ["ui.render"])
})

test("取得中に作業フォルダが変わったら、現在の作業先を読み直す", async () => {
  const { api, fire, render } = harness()
  const delayed = Promise.withResolvers<SessionUsage>()
  const readUsage = api.session.usage
  api.session.usage = () => delayed.promise
  await fire("command.run", {})
  await setImmediate()
  api.sessionState.cwd = "/workspace/other-worktree"
  api.sessionState.usage = { tokens: 63_000, window: 200_000, percent: 32 }
  api.session.usage = readUsage
  delayed.resolve({ startedAt: 0, rateLimits: [], context: { tokens: 20, window: 100, percent: 20 } })
  await setImmediate()
  const detail = await render("dock")
  assert.ok(!detail.includes(CWD))
  assert.ok(detail.includes(api.sessionState.cwd))
  assert.ok(detail.includes("32% · 63,000 / 200,000 tokens"))
})

test("セッション終了時は前の利用量を消す", async () => {
  const { fire, render } = harness()
  await fire("command.run", {})
  await setImmediate()
  await fire("session.end", {})
  assert.ok((await render("inline")).includes("コンテキスト  読み込み中"))
})
