import assert from "node:assert/strict"
import test from "node:test"
import type { RailSummary } from "../../../domain/session-summary.ts"
import { presentRail } from "../rail-view.ts"

const base: RailSummary = {
  scope: { id: "session-a", cwd: "/workspace/folder" },
  repository: null,
  worktree: { kind: "outside" },
  context: { kind: "unmeasured" },
}

function sections(summary: RailSummary) {
  return presentRail({ kind: "ready", summary })
}

test("detached のコミット ID を表示用に短くし、リポジトリ名はルートから補う", () => {
  const [environment] = sections({
    ...base,
    worktree: {
      kind: "ready",
      root: "/workspace/linked",
      checkout: { kind: "detached", oid: "abcdef01".repeat(5) },
      changes: { kind: "clean" },
    },
  })
  assert.deepEqual(environment, {
    label: "環境",
    compact: "linked · detached HEAD abcdef0",
    detail: ["linked · detached HEAD abcdef0", "/workspace/folder", "worktree /workspace/linked"],
  })
})

test("バイナリだけの変更にはテキストの行数を出さない", () => {
  const [, , changes] = sections({
    ...base,
    worktree: {
      kind: "ready",
      root: "/workspace/folder",
      checkout: { kind: "branch", name: "main" },
      changes: { kind: "tracked-changes", tracked: 1, untracked: 0, diff: { kind: "no-text", binary: 1 } },
    },
  })
  assert.deepEqual(changes?.detail, ["未コミット 1件 · 未追跡 0件", "バイナリ 1件"])
})

test("作業先に改行が含まれていても表示上は 1 行にする", () => {
  const [environment] = sections({ ...base, scope: { id: "session-a", cwd: "/workspace/folder\nname" } })
  assert.equal(environment?.compact, "folder�name · Git 管理外")
  assert.deepEqual(environment?.detail, ["/workspace/folder�name", "Git 管理外"])
})
