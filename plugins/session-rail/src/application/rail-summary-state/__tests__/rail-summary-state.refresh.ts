import assert from "node:assert/strict"
import test from "node:test"
import { createRailSummaryState } from "../rail-summary-state.ts"
import type { SummarySources } from "../../read-rail-summary/read-rail-summary.ts"

const sources: SummarySources = {
  sessionId: async () => "session",
  workingDirectory: async () => "/project",
  repository: async () => null,
  context: async () => ({ tokens: 1, window: 100 }),
  worktree: async () => ({ kind: "outside" }),
}

test("更新待ちの間にクリアしたら、許可が遅れても読み始めない", async () => {
  const state = createRailSummaryState()
  const gate = Promise.withResolvers<boolean>()
  let reads = 0
  let changes = 0
  const pending = state.refresh({
    ...sources,
    sessionId: async () => {
      reads += 1
      return "session"
    },
  }, () => { changes += 1 }, () => gate.promise)
  const cleared = state.clear()
  gate.resolve(true)
  await pending

  assert.equal(state.isCurrent(cleared), true)
  assert.equal(reads, 0)
  assert.equal(changes, 0)
  assert.equal(state.snapshot(), undefined)
})

test("同じセッションで更新が重なっても、遅れて返った古い値を反映しない", async () => {
  const state = createRailSummaryState()
  const firstRead = Promise.withResolvers<{ tokens: number; window: number }>()
  const started = Promise.withResolvers<void>()
  let changes = 0
  const onChange = () => { changes += 1 }
  const pending = state.refresh({
    ...sources,
    context: () => {
      started.resolve()
      return firstRead.promise
    },
  }, onChange)
  await started.promise
  await state.refresh({ ...sources, context: async () => ({ tokens: 25, window: 100 }) }, onChange)
  firstRead.resolve({ tokens: 1, window: 100 })
  await pending

  assert.deepEqual(state.snapshot()?.context, { kind: "ready", tokens: 25, window: 100, percent: 25 })
  assert.equal(changes, 1)
})
