import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { readWorktree, type RunGit } from "../read-worktree.ts"
import { git, initialize, runGit } from "./support/git-repository.ts"

test("変更がない Git リポジトリのブランチとルートを読む", async (t) => {
  const root = initialize(t)
  assert.deepEqual(await readWorktree(runGit, root), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    changes: { kind: "clean" },
  })
})

test("ステージ済み・未ステージ・名前変更・バイナリ・未追跡を区別する", async (t) => {
  const root = initialize(t)
  writeFileSync(join(root, "note.txt"), "first\nstaged\n")
  git(root, "add", "note.txt")
  writeFileSync(join(root, "note.txt"), "first\nstaged\nworking\n")
  git(root, "mv", "rename.txt", "new name.txt")
  writeFileSync(join(root, "data.bin"), Buffer.from([0, 2, 3]))
  const subdir = join(root, "untracked")
  mkdirSync(subdir)
  writeFileSync(join(subdir, "one.txt"), "not in the line count\n")
  writeFileSync(join(subdir, "two.txt"), "not in the line count\n")

  assert.deepEqual(await readWorktree(runGit, subdir), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    changes: {
      kind: "tracked-changes", tracked: 3, untracked: 2,
      diff: { kind: "text", added: 2, deleted: 1, binary: 1 },
    },
  })
})

test("行差分の出力が途中で切れても、途中までの行数を表示しない", async (t) => {
  const root = initialize(t)
  writeFileSync(join(root, "note.txt"), "changed\n")
  const limited: RunGit = async (args, cwd) => {
    const out = await runGit(args, cwd)
    if (args.includes("--numstat")) {
      return { ...out, isStdoutTruncated: true }
    }
    return out
  }
  assert.deepEqual(await readWorktree(limited, root), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    changes: { kind: "tracked-changes", tracked: 1, untracked: 0, diff: { kind: "unavailable" } },
  })
})

test("未追跡ファイルだけなら行差分を取得せず、件数だけを返す", async (t) => {
  const root = initialize(t)
  writeFileSync(join(root, "new.txt"), "not in the line count\n")
  const calls: Array<readonly string[]> = []
  const recording: RunGit = async (args, cwd) => {
    calls.push(args)
    return runGit(args, cwd)
  }
  assert.deepEqual(await readWorktree(recording, root), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    changes: { kind: "untracked-only", untracked: 1 },
  })
  assert.ok(!calls.some((args) => args[0] === "diff"))
})
