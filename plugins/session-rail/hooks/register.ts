import type { EngineInterface, On } from "claude-code"
import { presentRail, readRailSummary, readScope, sameScope, type RailSummary } from "../src/summary.ts"

const COMMAND = "rail"
const PANE_ID = "claude-mods-lab-session-rail"
const TITLE = "セッション"

export function register(on: On): void {
  let summary: RailSummary | undefined
  let revision = 0

  function clearSummary(): void {
    summary = undefined
    revision += 1
  }

  async function refresh($: EngineInterface, onlyWhenPlaced: boolean): Promise<void> {
    const request = ++revision
    if (onlyWhenPlaced) {
      const panes = await $.ui.panes()
      if (revision !== request || !panes.some((pane) => pane.id === PANE_ID && pane.isPlaced)) {
        return
      }
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nextSummary = await readRailSummary($)
      if (request !== revision) {
        return
      }
      const activeScope = await readScope($)
      if (request !== revision) {
        return
      }
      if (sameScope(nextSummary.scope, activeScope)) {
        summary = nextSummary
        $.ui.invalidate("ui.render")
        return
      }

      // 作業先が変わったら前の値を消し、現在の作業先を一度読み直す。
      summary = undefined
      $.ui.invalidate("ui.render")
    }
  }

  function refreshInBackground($: EngineInterface, onlyWhenPlaced: boolean): void {
    // データの取得不可は各セクションで扱う。UI の切断で会話を止めない。
    void refresh($, onlyWhenPlaced).catch(() => {})
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
      clearSummary()
      return {}
    }

    clearSummary()
    const opening = revision
    const pane = await $.ui.open({
      id: PANE_ID,
      title: TITLE,
      closeOnEscape: true,
      columns: 42,
      rows: 6,
    })
    if (!pane.isPlaced) {
      return { text: `セッションペインはまだ表示されていません（${pane.reason}）。` }
    }

    if (opening === revision) {
      refreshInBackground($, false)
    }
    return {}
  })

  on("ui.close", ($, event, next) => {
    if (event.id === PANE_ID) {
      clearSummary()
    }
    return next(event)
  })

  on("session.end", ($, event, next) => {
    clearSummary()
    $.ui.invalidate("ui.render")
    return next(event)
  })

  on("turn.complete", async ($, event, next) => {
    const result = await next(event)
    if (event.agentId === undefined) {
      refreshInBackground($, true)
    }
    return result
  })

  on("ui.render", { component: "Pane" }, ($, event, next) => {
    if (event.requestId !== PANE_ID || event.surface !== "terminal") {
      return next(event)
    }

    const { Box, Text } = $.ui.resolve(event)
    const sections = presentRail(summary)

    if (event.props.placement !== "dock") {
      const rows = sections.map(({ label, compact }) =>
        Text({ wrap: "truncate-middle", children: [`${label}  ${compact}`] }),
      )
      return Box({ flexDirection: "column", children: rows })
    }

    const rows = sections.map(({ label, detail }) =>
      Box({
        flexDirection: "column",
        children: [Text({ bold: true, children: [label] }), ...detail.map((line) => Text({ children: [line] }))],
      }),
    )
    return Box({ flexDirection: "column", gap: 1, children: rows })
  })
}
