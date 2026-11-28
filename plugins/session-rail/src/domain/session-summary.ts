import type { ContextUsage } from "./context-usage/context-usage.ts"
import type { WorktreeSummary } from "./worktree.ts"

export type SessionScope = { id: string | null; cwd: string | null }

export type RepositoryIdentity = { root: string; name: string | null }

export type RailSummary = {
  scope: SessionScope
  repository: RepositoryIdentity | null
  worktree: WorktreeSummary
  context: ContextUsage
}

export function sameScope(left: SessionScope, right: SessionScope): boolean {
  return left.id === right.id && left.cwd === right.cwd
}
