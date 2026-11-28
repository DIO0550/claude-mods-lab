import assert from "node:assert/strict"
import test from "node:test"
import { createRailSummaryState } from "../rail-summary-state.ts"
import { mainTurn, railPorts } from "./support/rail-fixture.ts"

test("配置を確認している間にペインが閉じたら、許可が遅れても読み始めない", async () => {
  const state = createRailSummaryState()
  const gate = Promise.withResolvers<boolean>()
  let reads = 0
  let changes = 0
  const pending = state.dispatch(mainTurn, {
    sources: {
      ...railPorts.sources,
      sessionId: async () => {
        reads += 1
        return "session"
      },
    },
    isPanePlaced: () => gate.promise,
    redraw: () => { changes += 1 },
  })
  await state.dispatch({ kind: "pane-closed" }, railPorts)
  gate.resolve(true)
  await pending

  assert.equal(reads, 0)
  assert.equal(changes, 0)
  assert.deepEqual(state.snapshot(), { kind: "pending" })
})

test("同じセッションで更新が重なっても、遅れて返った古い値を反映しない", async () => {
  const state = createRailSummaryState()
  const firstRead = Promise.withResolvers<{ tokens: number; window: number }>()
  const started = Promise.withResolvers<void>()
  let changes = 0
  const ports = { ...railPorts, redraw: () => { changes += 1 } }
  const pending = state.dispatch(mainTurn, {
    ...ports,
    sources: {
      ...ports.sources,
      context: () => {
        started.resolve()
        return firstRead.promise
      },
    },
  })
  await started.promise
  await state.dispatch(mainTurn, {
    ...ports,
    sources: { ...ports.sources, context: async () => ({ tokens: 25, window: 100 }) },
  })
  firstRead.resolve({ tokens: 1, window: 100 })
  await pending

  const snapshot = state.snapshot()
  assert.equal(snapshot.kind, "ready")
  assert.deepEqual(snapshot.summary.context, { kind: "ready", tokens: 25, window: 100, percent: 25 })
  assert.equal(changes, 1)
})
