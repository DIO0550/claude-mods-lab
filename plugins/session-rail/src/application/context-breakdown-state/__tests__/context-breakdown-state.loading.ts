import assert from "node:assert/strict"
import test from "node:test"
import type { ContextEstimate } from "../../../domain/context-breakdown/context-breakdown.ts"
import { createContextBreakdownState } from "../context-breakdown-state.ts"

const scope = { id: "session-a", cwd: "/project" }

function ports(contextBreakdown: () => Promise<ContextEstimate | null>) {
  return {
    sources: {
      contextBreakdown,
      sessionId: async () => scope.id,
      workingDirectory: async () => scope.cwd,
    },
    redraw: () => {},
  }
}

test("API が内訳要求を拒否しても後から閉じられる", async () => {
  const state = createContextBreakdownState()
  const sources = ports(async () => { throw new Error("unsupported") })

  await state.dispatch({ kind: "toggle" }, scope, sources)
  assert.deepEqual(state.snapshot(), { kind: "unavailable" })
  await state.dispatch({ kind: "toggle" }, scope, sources)
  assert.deepEqual(state.snapshot(), { kind: "collapsed" })
})

test("内訳だけの取得中にセッションが変わったときは古い推計を描画しない", async () => {
  const state = createContextBreakdownState()
  const pending = Promise.withResolvers<ContextEstimate>()
  const fixture = ports(() => pending.promise)

  const read = state.dispatch({ kind: "toggle" }, scope, fixture)
  assert.deepEqual(state.snapshot(), { kind: "loading" })
  fixture.sources.sessionId = async () => "session-b"
  pending.resolve({ window: 100, used: 15, categories: [{ kind: "used", name: "Messages", tokens: 15 }], groups: [] })
  await read
  assert.deepEqual(state.snapshot(), { kind: "collapsed" })
})
