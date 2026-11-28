import assert from "node:assert/strict"
import test from "node:test"
import type { RailSummary } from "../../../domain/session-summary.ts"
import type { PullRequestObservation } from "../../read-rail-summary/read-rail-summary.ts"
import { createPullRequestState } from "../pull-request-state.ts"

const summary: RailSummary = {
  scope: { id: "session-a", cwd: "/linked/src" },
  repository: null,
  context: { kind: "unmeasured" },
  worktree: { kind: "ready", root: "/linked", checkout: { kind: "branch", name: "feature/rail" }, changes: { kind: "clean" } },
}

test("Git 管理外や detached HEAD では GitHub を参照しない", async () => {
  const state = createPullRequestState()
  const fixture = {
    sources: {
      sessionId: async () => summary.scope.id,
      workingDirectory: async () => summary.scope.cwd,
      pullRequest: async () => assert.fail("unexpected lookup"),
    },
    redraw: () => assert.fail("unexpected redraw"),
  }
  await state.refresh({ ...summary, worktree: { kind: "outside" } }, fixture)
  await state.refresh({ ...summary, worktree: {
    kind: "ready", root: "/linked", checkout: { kind: "detached", oid: "abc" }, changes: { kind: "clean" },
  } }, fixture)
  assert.deepEqual(state.snapshot(), { kind: "hidden" })
})

test("読み込み中にセッションの作業先が変わったら PR を反映しない", async () => {
  const state = createPullRequestState()
  const pending = Promise.withResolvers<PullRequestObservation>()
  let cwd = summary.scope.cwd
  const read = state.refresh(summary, {
    sources: {
      sessionId: async () => summary.scope.id,
      workingDirectory: async () => cwd,
      pullRequest: () => pending.promise,
    },
    redraw: () => assert.fail("stale result was redrawn"),
  })
  cwd = "/different"
  pending.resolve({ kind: "unavailable" })
  await read
  assert.deepEqual(state.snapshot(), { kind: "hidden" })
})
