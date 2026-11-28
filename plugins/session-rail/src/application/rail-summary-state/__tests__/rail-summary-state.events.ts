import assert from "node:assert/strict"
import test from "node:test"
import { createRailSummaryState } from "../rail-summary-state.ts"
import { mainTurn, railPorts } from "./support/rail-fixture.ts"

test("サブエージェントのターン完了ではペインの配置確認も再取得もしない", async () => {
  const state = createRailSummaryState()
  let placementChecks = 0

  await state.dispatch({ kind: "turn-completed", origin: { kind: "subagent", agentId: "agent-a" } }, {
    ...railPorts,
    isPanePlaced: async () => {
      placementChecks += 1
      return true
    },
  })

  assert.equal(placementChecks, 0)
  assert.deepEqual(state.snapshot(), { kind: "pending" })
})

test("開き直したペインには、前の配置完了イベントを適用しない", async () => {
  const state = createRailSummaryState()
  const previous = state.beginOpening()
  await state.dispatch({ kind: "pane-closed" }, railPorts)
  const opening = state.beginOpening()

  await state.dispatch({ kind: "pane-placement-finished", opening: previous, placement: "placed" }, railPorts)
  assert.deepEqual(state.snapshot(), { kind: "pending" })

  await state.dispatch({ kind: "pane-placement-finished", opening, placement: "placed" }, railPorts)
  assert.equal(state.snapshot().kind, "ready")
})

test("配置できなかった時点では更新せず、実際に配置された後のメインターンで更新する", async () => {
  const state = createRailSummaryState()
  const opening = state.beginOpening()
  const notPlaced = { ...railPorts, isPanePlaced: async () => false }

  await state.dispatch({ kind: "pane-placement-finished", opening, placement: "unplaced" }, notPlaced)
  await state.dispatch(mainTurn, notPlaced)
  assert.deepEqual(state.snapshot(), { kind: "pending" })

  await state.dispatch(mainTurn, railPorts)
  assert.equal(state.snapshot().kind, "ready")
})
