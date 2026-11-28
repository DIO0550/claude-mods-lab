import type { EngineInterface, On } from "claude-code"
import { createRailSummaryState, type RailEvent } from "../src/application/rail-summary-state/rail-summary-state.ts"
import { SessionEvent, TurnOrigin } from "../src/domain/session-event.ts"
import { createSummarySources } from "../src/infrastructure/claude-code/summary-sources.ts"
import { renderRailPane } from "../src/presentation/render-rail-pane.ts"

const COMMAND = "rail"
const PANE_ID = "claude-mods-lab-session-rail"
const TITLE = "セッション"

async function isRailPlaced($: EngineInterface): Promise<boolean> {
  const panes = await $.ui.panes()
  return panes.some((pane) => pane.id === PANE_ID && pane.isPlaced)
}

export function register(on: On): void {
  const state = createRailSummaryState()

  function dispatch($: EngineInterface, event: RailEvent): void {
    // データの取得不可は各セクションで扱う。UI の切断で会話を止めない。
    void state.dispatch(event, {
      sources: createSummarySources($),
      isPanePlaced: () => isRailPlaced($),
      redraw: () => $.ui.invalidate("ui.render"),
    }).catch(() => {})
  }

  on("session.start", async ($, event, next) => {
    if (!event.isInteractive || event.surface !== "terminal") {
      return next(event)
    }

    await $.command.register({
      name: COMMAND,
      description: "セッションのペインを開閉する",
      immediate: true,
      isTerminalOnly: true,
    })
    return next(event)
  })

  on("command.run", { command: COMMAND }, async ($) => {
    // モジュール内のフラグではなく、実際に残っているペインを確認する。
    const panes = await $.ui.panes()
    if (panes.some((pane) => pane.id === PANE_ID)) {
      await $.ui.close({ id: PANE_ID })
      dispatch($, { kind: "pane-closed" })
      return {}
    }

    const opening = state.beginOpening()
    const pane = await $.ui.open({
      id: PANE_ID,
      title: TITLE,
      closeOnEscape: true,
      columns: 42,
      rows: 6,
    })
    const placement = pane.isPlaced ? "placed" : "unplaced"
    dispatch($, { kind: "pane-placement-finished", opening, placement })
    if (!pane.isPlaced) {
      return { text: `セッションペインはまだ表示されていません（${pane.reason}）。` }
    }

    return {}
  })

  on("ui.close", ($, event, next) => {
    if (event.id === PANE_ID) {
      dispatch($, { kind: "pane-closed" })
    }
    return next(event)
  })

  on("session.end", ($, event, next) => {
    dispatch($, SessionEvent.sessionEnded())
    return next(event)
  })

  on("turn.complete", async ($, event, next) => {
    const result = await next(event)
    const origin = TurnOrigin.fromAgentId(event.agentId)
    dispatch($, SessionEvent.turnCompleted(origin))
    return result
  })

  on("ui.render", { component: "Pane" }, ($, event, next) => {
    if (event.requestId !== PANE_ID || event.surface !== "terminal") {
      return next(event)
    }

    const placement = event.props.placement === "dock" ? "dock" : "inline"
    return renderRailPane($.ui.resolve(event), placement, state.snapshot())
  })
}
