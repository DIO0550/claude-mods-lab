import { ContextUsage, type ContextMeasurement } from "../../domain/context-usage/context-usage.ts"
import type { RailSummary, RepositoryIdentity, SessionScope } from "../../domain/session-summary.ts"
import { WorktreeSummary } from "../../domain/worktree.ts"

export type SummarySources = {
  sessionId(): Promise<string | null>
  workingDirectory(): Promise<string | null>
  repository(): Promise<RepositoryIdentity | null>
  context(): Promise<ContextMeasurement | null>
  worktree(cwd: string): Promise<WorktreeSummary>
}

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

export async function readScope(sources: SummarySources): Promise<SessionScope> {
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
