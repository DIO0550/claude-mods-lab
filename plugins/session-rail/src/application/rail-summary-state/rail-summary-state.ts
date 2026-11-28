import type { SessionEvent } from "../../domain/session-event.ts"
import { SessionScope, type RailSummary } from "../../domain/session-summary.ts"
import { createContextBreakdownState, type ContextAction } from "../context-breakdown-state/context-breakdown-state.ts"
import { createPullRequestState } from "../pull-request-state/pull-request-state.ts"
import { readRailSummary, readScope, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"
import { createSubagentListState, type SubagentAction } from "../subagent-list-state/subagent-list-state.ts"

export type RailSnapshot =
  | { kind: "pending" }
  | { kind: "ready"; summary: RailSummary }

export type RailTab = "overview" | "subagents"

type PaneOpening = { readonly kind: "pane-opening" }

type PaneEvent =
  | { kind: "pane-placement-finished"; opening: PaneOpening; placement: "placed" | "unplaced" }
  | { kind: "pane-closed" }
  | { kind: "context-control"; pane: PaneOpening; scope: SessionScope; action: ContextAction }
  | { kind: "tab-selected"; pane: PaneOpening; tab: RailTab }
  | { kind: "subagent-control"; pane: PaneOpening; action: SubagentAction }

export type RailEvent = SessionEvent | PaneEvent

type RailPorts = {
  sources: SummarySources
  isPanePlaced(): Promise<boolean>
  redraw(): void
}

export function createRailSummaryState() {
  let snapshot: RailSnapshot = { kind: "pending" }
  let tab: RailTab = "overview"
  const context = createContextBreakdownState()
  const pullRequest = createPullRequestState()
  const subagents = createSubagentListState()
  // 配置と取得は別々に完了する。ターン終了で配置待ちの操作を取り消さない。
  let pane: PaneOpening | undefined
  let paneOpening: PaneOpening | undefined
  let refreshing: symbol | undefined

  function clear(): void {
    snapshot = { kind: "pending" }
    tab = "overview"
    pane = undefined
    paneOpening = undefined
    refreshing = undefined
    context.collapse()
    pullRequest.clear()
    subagents.clear()
  }

  function beginOpening(): PaneOpening {
    clear()
    const opening = { kind: "pane-opening" } as const
    pane = opening
    paneOpening = opening
    return opening
  }

  async function refresh(ports: RailPorts, trigger: "pane-placed" | "main-turn-completed"): Promise<void> {
    const request = Symbol()
    refreshing = request
    if (trigger === "main-turn-completed") {
      const placed = await ports.isPanePlaced()
      if (!placed || refreshing !== request) {
        return
      }
    }

    pullRequest.clear()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nextSummary = await readRailSummary(ports.sources)
      if (refreshing !== request) {
        return
      }
      const activeScope = await readScope(ports.sources)
      if (refreshing !== request) {
        return
      }
      if (SessionScope.equals(nextSummary.scope, activeScope)) {
        if (snapshot.kind === "ready" && !SessionScope.equals(snapshot.summary.scope, nextSummary.scope)) {
          context.collapse()
        }
        snapshot = { kind: "ready", summary: nextSummary }
        const checkingPullRequest = pullRequest.refresh(nextSummary, ports)
        if (tab === "overview" && context.snapshot().kind !== "collapsed") {
          await Promise.all([context.refresh(nextSummary.scope, ports), checkingPullRequest])
          return
        }
        ports.redraw()
        return checkingPullRequest
      }

      // 作業先が変わったら前の値を消し、現在の作業先を一度読み直す。
      snapshot = { kind: "pending" }
      context.collapse()
      ports.redraw()
    }
  }

  async function refreshVisibleSubagents(ports: RailPorts): Promise<void> {
    const active = pane
    if (!active || tab !== "subagents") {
      return
    }
    const placed = await ports.isPanePlaced()
    if (!placed || pane !== active || tab !== "subagents") {
      return
    }
    return subagents.refresh(ports)
  }

  async function dispatch(event: RailEvent, ports: RailPorts): Promise<void> {
    switch (event.kind) {
      case "pane-placement-finished":
        if (event.opening !== paneOpening) {
          return
        }
        paneOpening = undefined
        if (event.placement === "unplaced") {
          return
        }
        return refresh(ports, "pane-placed")
      case "pane-closed":
        clear()
        return
      case "context-control":
        if (event.pane !== pane || tab !== "overview" || snapshot.kind !== "ready" || !SessionScope.equals(event.scope, snapshot.summary.scope)) {
          return
        }
        return context.dispatch(event.action, event.scope, ports)
      case "tab-selected":
        if (event.pane !== pane || tab === event.tab) {
          return
        }
        tab = event.tab
        if (tab === "subagents") {
          return subagents.refresh(ports)
        }
        subagents.clear()
        if (snapshot.kind === "ready" && context.snapshot().kind !== "collapsed") {
          return context.refresh(snapshot.summary.scope, ports)
        }
        ports.redraw()
        return
      case "subagent-control":
        if (event.pane !== pane || tab !== "subagents") {
          return
        }
        return subagents.dispatch(event.action, ports)
      case "session-ended":
        clear()
        ports.redraw()
        return
      case "turn-started":
        if (event.origin.kind === "subagent") {
          return refreshVisibleSubagents(ports)
        }
        return
      case "turn-completed":
        if (event.origin.kind !== "main") {
          return refreshVisibleSubagents(ports)
        }
        await Promise.all([refresh(ports, "main-turn-completed"), refreshVisibleSubagents(ports)])
        return
    }
  }

  return {
    beginOpening, dispatch, snapshot: () => snapshot, pane: () => pane, tab: () => tab,
    context: context.snapshot, pullRequest: pullRequest.snapshot, subagents: subagents.snapshot,
  }
}
