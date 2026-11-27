import type { On } from "claude-code"

const COMMAND = "rail"
const PANE_ID = "claude-mods-lab-session-rail"
const TITLE = "セッション"

const SECTIONS = [
  { label: "環境", detail: "~/work/example · main", compact: "main" },
  { label: "コンテキスト", detail: "28% · 28.1万 / 100万", compact: "28%" },
  { label: "変更", detail: "未コミット +18 / −4", compact: "+18 / −4" },
] as const

export function register(on: On): void {
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
      return {}
    }

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

    return {}
  })

  on("ui.render", { component: "Pane" }, ($, event, next) => {
    if (event.requestId !== PANE_ID || event.surface !== "terminal") {
      return next(event)
    }

    const { Box, Text } = $.ui.resolve(event)
    const preview = Text({ dimColor: true, children: ["プレビュー · 固定データ"] })

    if (event.props.placement !== "dock") {
      const rows = SECTIONS.map(({ label, compact }) => Text({ children: [`${label}  ${compact}`] }))
      return Box({ flexDirection: "column", children: [preview, ...rows] })
    }

    const sections = SECTIONS.map(({ label, detail }) =>
      Box({
        flexDirection: "column",
        children: [Text({ bold: true, children: [label] }), Text({ children: [detail] })],
      }),
    )
    return Box({ flexDirection: "column", gap: 1, children: [preview, ...sections] })
  })
}
