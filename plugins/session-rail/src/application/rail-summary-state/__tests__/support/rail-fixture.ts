import type { SummarySources } from "../../../read-rail-summary/read-rail-summary.ts"

const sources: SummarySources = {
  sessionId: async () => "session",
  workingDirectory: async () => "/project",
  repository: async () => null,
  context: async () => ({ tokens: 1, window: 100 }),
  contextBreakdown: async () => null,
  worktree: async () => ({ kind: "outside" }),
  pullRequest: async () => ({ kind: "none" }),
}

export const mainTurn = { kind: "turn-completed", origin: { kind: "main" } } as const

export const railPorts = {
  sources,
  isPanePlaced: async () => true,
  redraw: () => {},
}
