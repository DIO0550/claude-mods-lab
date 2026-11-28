import type { Subagent } from "../../domain/subagent/subagent.ts"
import type { SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export type SubagentListSnapshot =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; agents: readonly Subagent[]; expandedId: string | null }

export type SubagentAction =
  | { kind: "refresh" }
  | { kind: "toggle-details"; agentId: string }

type SubagentPorts = {
  sources: Pick<SummarySources, "sessionId" | "subagents">
  redraw(): void
}

export function createSubagentListState() {
  let snapshot: SubagentListSnapshot = { kind: "loading" }
  let request: symbol | undefined
  let session: string | null = null

  function clear(): void {
    snapshot = { kind: "loading" }
    request = undefined
    session = null
  }

  function unavailable(ports: SubagentPorts): void {
    snapshot = { kind: "unavailable" }
    request = undefined
    session = null
    ports.redraw()
  }

  async function refresh(ports: SubagentPorts): Promise<void> {
    const current = Symbol()
    request = current
    if (snapshot.kind !== "ready") {
      snapshot = { kind: "loading" }
      ports.redraw()
    }

    try {
      const id = await ports.sources.sessionId()
      if (request !== current) {
        return
      }
      if (!id) {
        unavailable(ports)
        return
      }
      if (snapshot.kind === "ready" && session !== id) {
        snapshot = { kind: "loading" }
        ports.redraw()
      }

      const agents = await ports.sources.subagents()
      if (request !== current) {
        return
      }
      const active = await ports.sources.sessionId()
      if (request !== current) {
        return
      }
      if (active !== id) {
        unavailable(ports)
        return
      }

      const expanded = snapshot.kind === "ready" ? snapshot.expandedId : null
      const expandedId = agents.some((agent) => agent.id === expanded) ? expanded : null
      snapshot = { kind: "ready", agents, expandedId }
      session = id
      request = undefined
      ports.redraw()
    } catch {
      if (request === current) {
        unavailable(ports)
      }
    }
  }

  async function dispatch(action: SubagentAction, ports: SubagentPorts): Promise<void> {
    if (action.kind === "refresh") {
      return refresh(ports)
    }
    if (snapshot.kind !== "ready" || !snapshot.agents.some((agent) => agent.id === action.agentId)) {
      return
    }
    const expandedId = snapshot.expandedId === action.agentId ? null : action.agentId
    snapshot = { ...snapshot, expandedId }
    ports.redraw()
  }

  return { clear, refresh, dispatch, snapshot: () => snapshot }
}
