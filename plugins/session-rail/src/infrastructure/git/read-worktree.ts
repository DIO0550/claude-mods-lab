import type { Checkout, LineChanges, WorktreeSummary } from "../../domain/worktree.ts"

type GitOutput = {
  exitCode: number
  stdout: string
  stderr: string
  isStdoutTruncated: boolean
}

export type RunGit = (args: readonly string[], cwd: string) => Promise<GitOutput>

type Status = {
  checkout: Checkout
  oid: string | null
  tracked: number
  untracked: number
}

function nulRecords(stdout: string): string[] | null {
  if (stdout === "") {
    return []
  }
  if (!stdout.endsWith("\0")) {
    return null
  }
  return stdout.slice(0, -1).split("\0")
}

function parseStatus(stdout: string): Status | null {
  const records = nulRecords(stdout)
  if (!records) {
    return null
  }

  let branch = ""
  let oid = ""
  let tracked = 0
  let untracked = 0
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ""
    if (record.startsWith("# branch.head ")) {
      branch = record.slice("# branch.head ".length)
      continue
    }
    if (record.startsWith("# branch.oid ")) {
      oid = record.slice("# branch.oid ".length)
      continue
    }
    if (record.startsWith("# ") || record.startsWith("! ")) {
      continue
    }
    if (record.startsWith("? ")) {
      untracked += 1
      continue
    }
    if (record.startsWith("2 ")) {
      // 名前変更・コピーの旧パスは、状態のない別レコードとして続く。
      if (!records[index + 1]) {
        return null
      }
      index += 1
      tracked += 1
      continue
    }
    if (record.startsWith("1 ") || record.startsWith("u ")) {
      tracked += 1
      continue
    }
    return null
  }

  if (!branch || !/^(?:\(initial\)|[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) {
    return null
  }
  const head = oid === "(initial)" ? null : oid
  if (branch === "(detached)") {
    if (head === null) {
      return null
    }
    return { checkout: { kind: "detached", oid: head }, oid: head, tracked, untracked }
  }
  return { checkout: { kind: "branch", name: branch }, oid: head, tracked, untracked }
}

function parseNumstat(stdout: string): LineChanges | null {
  const records = nulRecords(stdout)
  if (!records) {
    return null
  }

  const changes = { added: 0, deleted: 0, binary: 0 }
  for (let index = 0; index < records.length; index += 1) {
    const row = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(records[index] ?? "")
    if (!row) {
      return null
    }
    if (row[3] === "") {
      if (!records[index + 1] || !records[index + 2]) {
        return null
      }
      index += 2
    }
    if (row[1] === "-" && row[2] === "-") {
      changes.binary += 1
      continue
    }
    const added = Number(row[1])
    const deleted = Number(row[2])
    if (!Number.isSafeInteger(added) || !Number.isSafeInteger(deleted)) {
      return null
    }
    changes.added += added
    changes.deleted += deleted
  }
  return changes
}

function succeeded(result: GitOutput): boolean {
  return result.exitCode === 0 && !result.isStdoutTruncated
}

async function readLineChanges(run: RunGit, cwd: string, status: Status): Promise<LineChanges | null> {
  if (status.tracked === 0) {
    return { added: 0, deleted: 0, binary: 0 }
  }
  if (status.oid === null) {
    return null
  }

  try {
    const diff = await run(["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", status.oid, "--"], cwd)
    return succeeded(diff) ? parseNumstat(diff.stdout) : null
  } catch {
    return null
  }
}

async function checkoutMatches(run: RunGit, cwd: string, status: Status): Promise<boolean> {
  if (status.oid === null) {
    return true
  }
  const revision = await run(["rev-parse", "HEAD", "--symbolic-full-name", "HEAD"], cwd)
  const { checkout } = status
  const expectedBranch = checkout.kind === "detached" ? "HEAD" : `refs/heads/${checkout.name}`
  const [oid, branch] = revision.stdout.trimEnd().split(/\r?\n/)
  return succeeded(revision) && oid === status.oid && branch === expectedBranch
}

export async function readWorktree(run: RunGit, cwd: string): Promise<WorktreeSummary> {
  try {
    const rootResult = await run(["rev-parse", "--show-toplevel"], cwd)
    if (rootResult.exitCode !== 0 && /not a git repository|must be run in a work tree/.test(rootResult.stderr)) {
      return { kind: "outside" }
    }
    const root = rootResult.stdout.replace(/\r?\n$/, "")
    if (!succeeded(rootResult) || !root) {
      return { kind: "unavailable" }
    }

    const statusResult = await run(["status", "--porcelain=v2", "--branch", "--no-ahead-behind", "--untracked-files=all", "-z"], root)
    const status = succeeded(statusResult) ? parseStatus(statusResult.stdout) : null
    if (!status) {
      return { kind: "unavailable" }
    }

    const lines = await readLineChanges(run, root, status)
    // 同じコミットを指す別ブランチへの切り替えも検出する。
    if (!(await checkoutMatches(run, root, status))) {
      return { kind: "unavailable" }
    }

    return {
      kind: "ready",
      root,
      checkout: status.checkout,
      tracked: status.tracked,
      untracked: status.untracked,
      lines,
    }
  } catch {
    return { kind: "unavailable" }
  }
}
