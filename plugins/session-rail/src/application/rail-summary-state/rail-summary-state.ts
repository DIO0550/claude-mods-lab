import type { SessionEvent } from "../../domain/session-event.ts"
import { sameScope, type RailSummary } from "../../domain/session-summary.ts"
import { readRailSummary, readScope, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export type RailSnapshot =
  | { kind: "pending" }
  | { kind: "ready"; summary: RailSummary }

type PaneOpening = { readonly kind: "pane-opening" }

type PaneEvent =
  | { kind: "pane-placement-finished"; opening: PaneOpening; placement: "placed" | "unplaced" }
  | { kind: "pane-closed" }

export type RailEvent = SessionEvent | PaneEvent

type RailPorts = {
  sources: SummarySources
  isPanePlaced(): Promise<boolean>
  redraw(): void
}

export function createRailSummaryState() {
  let snapshot: RailSnapshot = { kind: "pending" }
  // 配置と取得は別々に完了する。ターン終了で配置待ちの操作を取り消さない。
  let paneOpening: PaneOpening | undefined
  let refreshing: symbol | undefined

  function clear(): void {
    snapshot = { kind: "pending" }
    paneOpening = undefined
    refreshing = undefined
  }

  function beginOpening(): PaneOpening {
    clear()
    const opening = { kind: "pane-opening" } as const
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
      if (sameScope(nextSummary.scope, activeScope)) {
        snapshot = { kind: "ready", summary: nextSummary }
        ports.redraw()
        return
      }

      // 作業先が変わったら前の値を消し、現在の作業先を一度読み直す。
      snapshot = { kind: "pending" }
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

  return { beginOpening, dispatch, snapshot: () => snapshot }
}
