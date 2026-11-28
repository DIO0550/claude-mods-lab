import { ContextBreakdown, type ContextGroupKind } from "../../domain/context-breakdown/context-breakdown.ts"
import { SessionScope } from "../../domain/session-summary.ts"
import { readScope, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export const CONTEXT_ITEMS_PER_PAGE = 12

type GroupPage = { kind: ContextGroupKind; offset: number }

export type ContextBreakdownSnapshot =
  | { kind: "collapsed" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; breakdown: ContextBreakdown; group: GroupPage | null }

export type ContextAction =
  | { kind: "toggle" }
  | { kind: "toggle-group"; group: ContextGroupKind }
  | { kind: "page-group"; group: ContextGroupKind; direction: -1 | 1 }

type ContextPorts = {
  sources: Pick<SummarySources, "sessionId" | "workingDirectory" | "contextBreakdown">
  redraw(): void
}

function groupCount(breakdown: ContextBreakdown, kind: ContextGroupKind): number {
  return breakdown.groups.find((group) => group.kind === kind)?.items.length ?? 0
}

function lastPageOffset(count: number): number {
  return Math.floor((count - 1) / CONTEXT_ITEMS_PER_PAGE) * CONTEXT_ITEMS_PER_PAGE
}

export function createContextBreakdownState() {
  let snapshot: ContextBreakdownSnapshot = { kind: "collapsed" }
  let group: GroupPage | null = null
  let request: symbol | undefined

  function collapse(): void {
    request = undefined
    group = null
    snapshot = { kind: "collapsed" }
  }

  async function refresh(scope: SessionScope, ports: ContextPorts): Promise<void> {
    const current = Symbol()
    request = current
    snapshot = { kind: "loading" }
    ports.redraw()

    let breakdown: ContextBreakdown | null = null
    try {
      breakdown = ContextBreakdown.fromEstimate(await ports.sources.contextBreakdown())
    } catch {
      // 内訳に非対応でも通常の使用量は残す。
    }
    if (request !== current) {
      return
    }
    const activeScope = await readScope(ports.sources)
    if (request !== current) {
      return
    }
    if (!SessionScope.equals(scope, activeScope)) {
      collapse()
      ports.redraw()
      return
    }

    request = undefined
    if (!breakdown) {
      snapshot = { kind: "unavailable" }
      ports.redraw()
      return
    }
    if (group) {
      const count = groupCount(breakdown, group.kind)
      group = count === 0 ? null : { kind: group.kind, offset: Math.min(group.offset, lastPageOffset(count)) }
    }
    snapshot = { kind: "ready", breakdown, group }
    ports.redraw()
  }

  async function dispatch(action: ContextAction, scope: SessionScope, ports: ContextPorts): Promise<void> {
    if (action.kind === "toggle") {
      if (snapshot.kind === "collapsed") {
        return refresh(scope, ports)
      }
      collapse()
      ports.redraw()
      return
    }
    if (snapshot.kind !== "ready") {
      return
    }
    const { breakdown } = snapshot
    const count = groupCount(breakdown, action.group)
    if (count === 0) {
      return
    }
    if (action.kind === "toggle-group") {
      group = group?.kind === action.group ? null : { kind: action.group, offset: 0 }
      snapshot = { kind: "ready", breakdown, group }
      ports.redraw()
      return
    }
    if (group?.kind !== action.group) {
      return
    }
    const offset = Math.min(lastPageOffset(count), Math.max(0, group.offset + action.direction * CONTEXT_ITEMS_PER_PAGE))
    if (offset === group.offset) {
      return
    }
    group = { kind: action.group, offset }
    snapshot = { kind: "ready", breakdown, group }
    ports.redraw()
  }

  return { collapse, refresh, dispatch, snapshot: () => snapshot }
}
