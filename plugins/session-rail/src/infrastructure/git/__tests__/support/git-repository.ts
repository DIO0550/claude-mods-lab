import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestContext } from "node:test"
import type { RunGit } from "../../read-worktree.ts"

export function temporaryDirectory(t: TestContext): string {
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

export const runGit: RunGit = async (args, cwd) => gitResult(cwd, args)

export function git(cwd: string, ...args: string[]): string {
  const result = gitResult(cwd, args)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout
}

export function initialize(t: TestContext, commit = true): string {
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
