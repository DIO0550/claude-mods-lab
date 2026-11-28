import assert from "node:assert/strict"
import test from "node:test"
import { readRailSummary, type SummarySources } from "../read-rail-summary.ts"

const CWD = "/linked/src"
const WORKTREE = {
  kind: "ready",
  root: "/linked",
  checkout: { kind: "branch", name: "feature/rail" },
  changes: { kind: "untracked-only", untracked: 1 },
} as const

function sources(overrides: Partial<SummarySources> = {}): SummarySources {
  return {
    sessionId: async () => "session-a",
    workingDirectory: async () => CWD,
    repository: async () => ({ name: "owner/repo", root: "/main" }),
    context: async () => ({ tokens: 30, window: 100 }),
    contextBreakdown: async () => null,
    worktree: async () => WORKTREE,
    pullRequest: async () => ({ kind: "none" }),
    ...overrides,
  }
}

test("メインのリポジトリルートではなく、セッションの作業先を取得元へ渡す", async () => {
  const summary = await readRailSummary(sources({
    worktree: async (cwd) => {
      assert.equal(cwd, CWD)
      return WORKTREE
    },
  }))
  assert.deepEqual(summary, {
    scope: { id: "session-a", cwd: CWD },
    repository: { name: "owner/repo", root: "/main" },
    worktree: WORKTREE,
    context: { kind: "ready", tokens: 30, window: 100, percent: 30 },
  })
})

test("作業先が取れないときは Git を呼ばず、コンテキストは残す", async () => {
  let gitCalls = 0
  const summary = await readRailSummary(sources({
    workingDirectory: async () => { throw new Error("作業先が取得不可") },
    worktree: async () => {
      gitCalls += 1
      return WORKTREE
    },
  }))
  assert.equal(gitCalls, 0)
  assert.equal(summary.scope.cwd, null)
  assert.deepEqual(summary.worktree, { kind: "unavailable" })
  assert.equal(summary.context.kind, "ready")
})

test("リポジトリ情報と計測値が取得できなくても worktree の値を残す", async () => {
  const unavailable = async () => { throw new Error("取得不可") }
  const summary = await readRailSummary(sources({ repository: unavailable, context: unavailable }))
  assert.equal(summary.repository, null)
  assert.deepEqual(summary.context, { kind: "unavailable" })
  assert.deepEqual(summary.worktree, WORKTREE)
})
