import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import type { Subagent } from "../../../domain/subagent/subagent.ts"
import { createSubagentListState } from "../subagent-list-state.ts"

const agent: Subagent = { id: "a", name: "Explore", type: "Explore", task: "調査", progress: null, status: "running" }

test("同じセッションで状態が更新されても展開を保ち、一覧から消えた行の選択は捨てる", async () => {
  const state = createSubagentListState()
  let agents = [agent]
  const ports = {
    sources: { sessionId: async () => "session-a", subagents: async () => agents },
    redraw: () => {},
  }
  await state.refresh(ports)
  await state.dispatch({ kind: "toggle-details", agentId: "a" }, ports)
  agents = [{ ...agent, status: "completed" }]
  await state.refresh(ports)
  assert.deepEqual(state.snapshot(), { kind: "ready", agents, expandedId: "a" })

  agents = []
  await state.refresh(ports)
  assert.deepEqual(state.snapshot(), { kind: "ready", agents: [], expandedId: null })
})

test("取得中にセッションが変わったときは前の一覧を表示しない", async () => {
  const state = createSubagentListState()
  const delayed = Promise.withResolvers<Subagent[]>()
  let id = "session-a"
  const ports = {
    sources: { sessionId: async () => id, subagents: () => delayed.promise },
    redraw: () => {},
  }
  const reading = state.refresh(ports)
  await setImmediate()
  id = "session-b"
  delayed.resolve([agent])
  await reading
  assert.deepEqual(state.snapshot(), { kind: "unavailable" })
})

test("遅れて返った一覧が新しい結果を上書きしない", async () => {
  const state = createSubagentListState()
  const delayed = Promise.withResolvers<Subagent[]>()
  let result = delayed.promise
  const ports = {
    sources: { sessionId: async () => "session-a", subagents: () => result },
    redraw: () => {},
  }
  const older = state.refresh(ports)
  await setImmediate()
  const latest: Subagent[] = [{ ...agent, status: "failed" }]
  result = Promise.resolve(latest)
  await state.refresh(ports)
  delayed.resolve([agent])
  await older
  assert.deepEqual(state.snapshot(), { kind: "ready", agents: latest, expandedId: null })
})
