import type { EngineInterface } from "claude-code"
import type { SummarySources } from "../../application/read-rail-summary/read-rail-summary.ts"
import { readWorktree } from "../git/read-worktree.ts"

export function createSummarySources($: Pick<EngineInterface, "session" | "process">): SummarySources {
  return {
    sessionId: () => $.session.id(),
    workingDirectory: () => $.session.cwd(),
    async repository() {
      const repo = await $.session.repo()
      if (!repo) {
        return null
      }
      return { root: repo.root, name: repo.name }
    },
    async context() {
      return (await $.session.usage())?.context ?? null
    },
    async contextBreakdown() {
      const breakdown = (await $.session.usage({ breakdown: "summary" }))?.context?.breakdown
      if (!breakdown) {
        return null
      }
      return {
        used: breakdown.totalTokens,
        window: breakdown.rawMaxTokens,
        categories: breakdown.categories.map(({ kind, name, tokens }) => ({ kind, name, tokens })),
        groups: [
          { kind: "mcp-tools", items: breakdown.mcpTools?.map(({ name, tokens, isLoaded }) => ({ name, tokens, deferred: isLoaded === false })) ?? [] },
          { kind: "memory-files", items: breakdown.memoryFiles?.map(({ path, tokens }) => ({ name: path, tokens })) ?? [] },
          { kind: "agents", items: breakdown.agents?.map(({ agentType, tokens }) => ({ name: agentType, tokens })) ?? [] },
        ],
      }
    },
    worktree: (cwd) => readWorktree(
      (args, dir) => $.process.run(["git", "--no-optional-locks", ...args], {
        cwd: dir,
        env: { LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
        timeoutMs: 2500,
      }),
      cwd,
    ),
  }
}
