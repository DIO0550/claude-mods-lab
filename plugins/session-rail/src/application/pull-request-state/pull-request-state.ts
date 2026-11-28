import { SessionScope, type RailSummary } from "../../domain/session-summary.ts"
import { readScope, type PullRequestObservation, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export type PullRequestSnapshot = { kind: "hidden" } | Exclude<PullRequestObservation, { kind: "stale" }>

type PullRequestPorts = {
  sources: Pick<SummarySources, "pullRequest" | "sessionId" | "workingDirectory">
  redraw(): void
}

export function createPullRequestState() {
  let snapshot: PullRequestSnapshot = { kind: "hidden" }
  let request: symbol | undefined

  function clear(): void {
    request = undefined
    snapshot = { kind: "hidden" }
  }

  async function refresh({ worktree, scope }: RailSummary, ports: PullRequestPorts): Promise<void> {
    clear()
    if (worktree.kind !== "ready" || worktree.checkout.kind !== "branch") {
      return
    }
    const current = Symbol()
    request = current
    let observation: PullRequestObservation
    try {
      observation = await ports.sources.pullRequest({ root: worktree.root, branch: worktree.checkout.name })
    } catch {
      observation = { kind: "unavailable" }
    }
    if (request !== current || observation.kind === "stale") {
      return
    }
    const activeScope = await readScope(ports.sources)
    if (request !== current || !SessionScope.equals(scope, activeScope)) {
      return
    }
    snapshot = observation
    request = undefined
    ports.redraw()
  }

  return { clear, refresh, snapshot: () => snapshot }
}
