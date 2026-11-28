import assert from "node:assert/strict"
import test from "node:test"
import { PANE_ID, harness } from "./support/rail-harness.ts"

test("対話ターミナルのセッションに /rail を登録する", async () => {
  const { api, fire, hooks } = harness()
  const event = { isInteractive: true, surface: "terminal" }

  assert.deepEqual(await fire("session.start", event), { forwarded: event })
  assert.equal(api.commands.length, 1)
  assert.equal(api.commands[0]?.name, "rail")
  assert.equal(api.commands[0]?.immediate, true)
  assert.equal(api.commands[0]?.isTerminalOnly, true)
  assert.deepEqual(hooks.get("command.run")?.selector, { command: "rail" })
  assert.deepEqual(hooks.get("ui.render")?.selector, { component: "Pane" })
})

test("非対話セッションと Desktop には登録しない", async () => {
  const { api, fire } = harness()
  await fire("session.start", { isInteractive: false, surface: null })
  await fire("session.start", { isInteractive: true, surface: "desktop" })
  assert.deepEqual(api.commands, [])
})

test("/rail の再実行では自分のペインだけを閉じる", async () => {
  const { api, fire } = harness()
  api.openPanes.add("another-pane")

  assert.deepEqual(await fire("command.run", {}), {})
  assert.equal(api.opens[0]?.id, PANE_ID)
  assert.equal(api.opens[0]?.closeOnEscape, true)
  assert.equal(api.opens[0]?.focus, undefined)
  assert.deepEqual(await fire("command.run", {}), {})
  assert.deepEqual(api.closes, [PANE_ID])
  assert.deepEqual([...api.openPanes], ["another-pane"])
})

test("ユーザーが端末側で閉じた後も /rail で開ける", async () => {
  const { api, fire } = harness()
  await fire("command.run", {})
  api.openPanes.delete(PANE_ID)

  await fire("command.run", {})
  assert.equal(api.opens.length, 2)
  assert.deepEqual(api.closes, [])
  assert.ok(api.openPanes.has(PANE_ID))
})

test("ペインを配置できないときは理由を表示する", async () => {
  const { fire } = harness({ isPlaced: false, reason: "no-surface" })
  assert.deepEqual(await fire("command.run", {}), {
    text: "セッションペインはまだ表示されていません（no-surface）。",
  })
})
