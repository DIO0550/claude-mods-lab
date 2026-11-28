import type { ContextEstimate } from "../../domain/context-breakdown/context-breakdown.ts"
import { ContextUsage, type ContextMeasurement } from "../../domain/context-usage/context-usage.ts"
import type { PullRequest } from "../../domain/pull-request/pull-request.ts"
import type { RailSummary, RepositoryIdentity, SessionScope } from "../../domain/session-summary.ts"
import type { Subagent } from "../../domain/subagent/subagent.ts"
import { WorktreeSummary } from "../../domain/worktree.ts"

export type PullRequestTarget = { root: string; branch: string }
export type PullRequestObservation =
  | { kind: "found"; request: PullRequest }
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "stale" }

export type SummarySources = {
  sessionId(): Promise<string | null>
  workingDirectory(): Promise<string | null>
  repository(): Promise<RepositoryIdentity | null>
  context(): Promise<ContextMeasurement | null>
  contextBreakdown(): Promise<ContextEstimate | null>
  worktree(cwd: string): Promise<WorktreeSummary>
  pullRequest(target: PullRequestTarget): Promise<PullRequestObservation>
  subagents(): Promise<readonly Subagent[]>
}

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

export async function readScope(sources: Pick<SummarySources, "sessionId" | "workingDirectory">): Promise<SessionScope> {
  const [id, cwd] = await Promise.all([
    optional(() => sources.sessionId()),
    optional(() => sources.workingDirectory()),
  ])
  return { id, cwd }
}

export async function readRailSummary(sources: SummarySources): Promise<RailSummary> {
  const scope = await readScope(sources)
  const { cwd } = scope
  const [repository, worktree, measurement] = await Promise.all([
    optional(() => sources.repository()),
    cwd ? optional(() => sources.worktree(cwd)) : null,
    optional(() => sources.context()),
  ])
  return {
    scope,
    repository,
    worktree: worktree ?? WorktreeSummary.unavailable(),
    context: ContextUsage.fromMeasurement(measurement),
  }
}
