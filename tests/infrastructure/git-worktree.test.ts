import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { readWorktree, type RunGit } from "../../plugins/session-rail/src/infrastructure/git/read-worktree.ts"

function temporaryDirectory(t: TestContext): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "session-rail-")))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function gitResult(cwd: string, args: readonly string[]) {
  const child = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  })
  if (child.error) {
    throw child.error
  }
  return { exitCode: child.status ?? 1, stdout: child.stdout, stderr: child.stderr, isStdoutTruncated: false }
}

const runGit: RunGit = async (args, cwd) => gitResult(cwd, args)

function git(cwd: string, ...args: string[]): string {
  const result = gitResult(cwd, args)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout
}

function initialize(t: TestContext, commit = true): string {
  const dir = temporaryDirectory(t)
  git(dir, "init", "-q", "--initial-branch=main")
  git(dir, "config", "user.name", "Session Rail Test")
  git(dir, "config", "user.email", "rail@example.invalid")
  git(dir, "config", "commit.gpgSign", "false")
  if (commit) {
    writeFileSync(join(dir, "note.txt"), "first\nsecond\n")
    writeFileSync(join(dir, "rename.txt"), "rename me\n")
    writeFileSync(join(dir, "data.bin"), Buffer.from([0, 1]))
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "initial")
  }
  return dir
}

test("変更がない Git リポジトリのブランチとルートを読む", async (t) => {
  const root = initialize(t)
  assert.deepEqual(await readWorktree(runGit, root), {
    kind: "ready", root, checkout: { kind: "branch", name: "main" },
    tracked: 0, untracked: 0, lines: { added: 0, deleted: 0, binary: 0 },
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
    tracked: 3, untracked: 2, lines: { added: 2, deleted: 1, binary: 1 },
  })
})

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

test("Git 管理外と Git の起動失敗を区別する", async (t) => {
  const dir = temporaryDirectory(t)
  assert.deepEqual(await readWorktree(runGit, dir), { kind: "outside" })
  const missing: RunGit = async () => { throw new Error("git was not found") }
  assert.deepEqual(await readWorktree(missing, dir), { kind: "unavailable" })
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
    tracked: 1, untracked: 0, lines: null,
  })
})
