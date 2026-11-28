import assert from "node:assert/strict"
import test from "node:test"
import { readWorktree, type RunGit } from "../read-worktree.ts"
import { runGit, temporaryDirectory } from "./support/git-repository.ts"

test("Git 管理外と Git の起動失敗を区別する", async (t) => {
  const dir = temporaryDirectory(t)
  assert.deepEqual(await readWorktree(runGit, dir), { kind: "outside" })
  const missing: RunGit = async () => { throw new Error("git was not found") }
  assert.deepEqual(await readWorktree(missing, dir), { kind: "unavailable" })
})
