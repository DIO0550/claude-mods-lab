import type { PullRequestObservation, PullRequestTarget } from "../../../application/read-rail-summary/read-rail-summary.ts"
import { CiStatus, PullRequest, type CheckResult } from "../../../domain/pull-request/pull-request.ts"
import type { RunGit } from "../../git/read-worktree.ts"

type GhResult = {
  exitCode: number
  stdout: string
  stderr: string
  isStdoutTruncated: boolean
  isStderrTruncated: boolean
}

export type RunGh = (args: readonly string[], cwd: string) => Promise<GhResult>

const PR_FIELDS = "number,title,url,additions,deletions,state,isDraft,headRefName,statusCheckRollup"
const RUNNING = new Set(["EXPECTED", "IN_PROGRESS", "PENDING", "QUEUED", "REQUESTED", "WAITING"])
const FAILED = new Set(["ACTION_REQUIRED", "CANCELLED", "ERROR", "FAILURE", "STALE", "STARTUP_FAILURE", "TIMED_OUT"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function readCheck(value: unknown): CheckResult {
  if (!isRecord(value)) {
    return "unknown"
  }
  if (value.__typename === "StatusContext") {
    if (typeof value.state !== "string") {
      return "unknown"
    }
    if (value.state === "SUCCESS") {
      return "passed"
    }
    if (FAILED.has(value.state)) {
      return "failed"
    }
    return RUNNING.has(value.state) ? "running" : "unknown"
  }
  if (value.__typename !== "CheckRun" || typeof value.status !== "string") {
    return "unknown"
  }
  if (RUNNING.has(value.status)) {
    return "running"
  }
  if (value.status !== "COMPLETED" || typeof value.conclusion !== "string") {
    return "unknown"
  }
  if (value.conclusion === "SUCCESS") {
    return "passed"
  }
  if (value.conclusion === "NEUTRAL" || value.conclusion === "SKIPPED") {
    return "skipped"
  }
  return FAILED.has(value.conclusion) ? "failed" : "unknown"
}

function readPhase(state: unknown, draft: unknown): PullRequest["phase"] | null {
  switch (state) {
    case "OPEN":
      if (typeof draft !== "boolean") {
        return null
      }
      return draft ? "draft" : "open"
    case "MERGED":
      return "merged"
    case "CLOSED":
      return "closed"
    default:
      return null
  }
}

async function readResult(result: GhResult, git: RunGit, target: PullRequestTarget): Promise<PullRequestObservation> {
  if (result.exitCode !== 0) {
    // gh の現在ブランチ探索が返す未検出だけを「PR なし」とする。
    if (result.exitCode === 1 && !result.isStderrTruncated && /^no pull requests found(?: for branch "[^\r\n]+")?$/.test(result.stderr.trim())) {
      return { kind: "none" }
    }
    return { kind: "unavailable" }
  }
  if (result.isStdoutTruncated) {
    return { kind: "unavailable" }
  }
  const value: unknown = JSON.parse(result.stdout)
  if (!isRecord(value)) {
    return { kind: "unavailable" }
  }
  const { number, title, url, additions, deletions, state, isDraft, headRefName, statusCheckRollup } = value
  if (typeof headRefName !== "string") {
    return { kind: "unavailable" }
  }
  const phase = readPhase(state, isDraft)
  if (!phase || typeof number !== "number" || typeof title !== "string" || typeof url !== "string" || typeof additions !== "number" || typeof deletions !== "number") {
    return { kind: "unavailable" }
  }
  const checks = Array.isArray(statusCheckRollup) ? statusCheckRollup.map(readCheck) : null
  const request = PullRequest.fromDetails({ number, title, url, additions, deletions, phase, ci: CiStatus.fromChecks(checks) })
  if (!request) {
    return { kind: "unavailable" }
  }
  if (headRefName !== target.branch) {
    // gh pr checkout などで、手元のブランチ名と PR の head が異なる場合もある。
    const tracking = await git(["config", "--get", `branch.${target.branch}.merge`], target.root)
    const ref = tracking.stdout.replace(/\r?\n$/, "")
    if (tracking.exitCode !== 0 || tracking.isStdoutTruncated || (ref !== `refs/heads/${headRefName}` && ref !== `refs/pull/${number}/head`)) {
      return { kind: "stale" }
    }
  }
  return { kind: "found", request }
}

export async function readPullRequest(run: RunGh, git: RunGit, target: PullRequestTarget): Promise<PullRequestObservation> {
  let observation: PullRequestObservation
  try {
    const result = await run(["pr", "view", "--json", PR_FIELDS], target.root)
    observation = await readResult(result, git, target)
  } catch {
    observation = { kind: "unavailable" }
  }

  try {
    const head = await git(["rev-parse", "--show-toplevel", "--symbolic-full-name", "HEAD"], target.root)
    const identity = head.stdout.replace(/\r?\n$/, "")
    const ref = `refs/heads/${target.branch}`
    if (head.exitCode !== 0 || head.isStdoutTruncated || (identity !== `${target.root}\n${ref}` && identity !== `${target.root}\r\n${ref}`)) {
      return { kind: "stale" }
    }
  } catch {
    return { kind: "stale" }
  }
  return observation
}
