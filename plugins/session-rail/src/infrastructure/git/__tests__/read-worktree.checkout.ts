import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { readWorktree, type RunGit } from "../read-worktree.ts"
import { git, initialize, runGit, temporaryDirectory } from "./support/git-repository.ts"

test("メインの作業ツリーではなく、開いている worktree のブランチ・差分を表示する", async (t) => {
  const main = initialize(t)
  const container = temporaryDirectory(t)
  const worktree = join(container, "linked")
  git(main, "worktree", "add", "-qb", "feature/rail", worktree)
  writeFileSync(join(worktree, "note.txt"), "changed\n")
  assert.deepEqual(await readWorktree(runGit, worktree), {
    kind: "ready", root: worktree, checkout: { kind: "branch", name: "feature/rail" },
    tracked: 1, untracked: 0, lines: { added: 1, deleted: 2, binary: 0 },
  })
})

test("detached HEAD でもコミットと行差分を表示する", async (t) => {
  const root = initialize(t)
  const oid = git(root, "rev-parse", "HEAD").trim()
  git(root, "switch", "--quiet", "--detach", "HEAD")
  writeFileSync(join(root, "note.txt"), "changed\n")
  assert.deepEqual(await readWorktree(runGit, root), {
    kind: "ready", root, checkout: { kind: "detached", oid },
    tracked: 1, untracked: 0, lines: { added: 1, deleted: 2, binary: 0 },
  })
})

test("初回コミット前はファイル件数を出すが、HEAD との差分行数は出さない", async (t) => {
  const root = initialize(t, false)
  writeFileSync(join(root, "first.txt"), "first\n")
  git(root, "add", "first.txt")
  assert.deepEqual(await readWorktree(runGit, root), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    tracked: 1, untracked: 0, lines: null,
  })
})

test("途中で同じ HEAD の別ブランチへ切り替わった場合は、古い値を出さない", async (t) => {
  const root = initialize(t)
  writeFileSync(join(root, "note.txt"), "changed\n")
  const movingCheckout: RunGit = async (args, cwd) => {
    const out = await runGit(args, cwd)
    if (args.includes("--numstat")) {
      git(root, "switch", "-qc", "different-branch")
    }
    return out
  }
  assert.deepEqual(await readWorktree(movingCheckout, root), { kind: "unavailable" })
})
