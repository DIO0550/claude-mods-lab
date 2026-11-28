import type { SessionEvent } from "../../domain/session-event.ts"
import { SessionScope, type RailSummary } from "../../domain/session-summary.ts"
import { createContextBreakdownState, type ContextAction } from "../context-breakdown-state/context-breakdown-state.ts"
import { readRailSummary, readScope, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export type RailSnapshot =
  | { kind: "pending" }
  | { kind: "ready"; summary: RailSummary }

type PaneOpening = { readonly kind: "pane-opening" }

type PaneEvent =
  | { kind: "pane-placement-finished"; opening: PaneOpening; placement: "placed" | "unplaced" }
  | { kind: "pane-closed" }
  | { kind: "context-control"; pane: PaneOpening; scope: SessionScope; action: ContextAction }

export type RailEvent = SessionEvent | PaneEvent

type RailPorts = {
  sources: SummarySources
  isPanePlaced(): Promise<boolean>
  redraw(): void
}

export function createRailSummaryState() {
  let snapshot: RailSnapshot = { kind: "pending" }
  const context = createContextBreakdownState()
  // 配置と取得は別々に完了する。ターン終了で配置待ちの操作を取り消さない。
  let pane: PaneOpening | undefined
  let paneOpening: PaneOpening | undefined
  let refreshing: symbol | undefined

  function clear(): void {
    snapshot = { kind: "pending" }
    pane = undefined
    paneOpening = undefined
    refreshing = undefined
    context.collapse()
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
        if (context.snapshot().kind !== "collapsed") {
          return context.refresh(nextSummary.scope, ports)
        }
        ports.redraw()
        return
      }

      // 作業先が変わったら前の値を消し、現在の作業先を一度読み直す。
      snapshot = { kind: "pending" }
      context.collapse()
      ports.redraw()
    }
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
        if (event.pane !== pane || snapshot.kind !== "ready" || !SessionScope.equals(event.scope, snapshot.summary.scope)) {
          return
        }
        return context.dispatch(event.action, event.scope, ports)
      case "session-ended":
        clear()
        ports.redraw()
        return
      case "turn-completed":
        if (event.origin.kind !== "main") {
          return
        }
        return refresh(ports, "main-turn-completed")
    }
  }

  return { beginOpening, dispatch, snapshot: () => snapshot, pane: () => pane, context: context.snapshot }
}
