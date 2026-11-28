import type { Elements } from "claude-code"
import type { ContextAction, ContextBreakdownSnapshot } from "../application/context-breakdown-state/context-breakdown-state.ts"
import type { PullRequestSnapshot } from "../application/pull-request-state/pull-request-state.ts"
import type { RailSnapshot, RailTab } from "../application/rail-summary-state/rail-summary-state.ts"
import { presentContextBreakdown } from "./context-breakdown-view/context-breakdown-view.ts"
import { presentPullRequest } from "./pull-request-view/pull-request-view.ts"
import { presentRail } from "./rail-view/rail-view.ts"
import { renderSubagentTab, type SubagentTabControls } from "./subagent-tab/subagent-tab.ts"

type TerminalElements = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Link">
type TerminalNode = ReturnType<TerminalElements[keyof TerminalElements]>
type ContextView = ReturnType<typeof presentContextBreakdown>
type ContextControls = { snapshot: ContextBreakdownSnapshot; dispatch(action: ContextAction): void }
type ChangesControls = { pullRequest: PullRequestSnapshot; openLocalDiff?: () => Promise<void> }
type PaneLayout = { placement: "dock" | "inline"; columns: number }
type OverviewControls = { context?: ContextControls; changes?: ChangesControls }
type RailControls = OverviewControls & {
  tabs: { active: RailTab; select(tab: RailTab): void; subagents: SubagentTabControls }
}

const TABS = [
  { tab: "overview", label: "概要" },
  { tab: "subagents", label: "サブエージェント" },
] as const

const CATEGORY_COLORS = { used: "#78c98a", buffer: "#e0b45b", free: "#809099", deferred: "#a1a6a6" }

function renderContextDetails(
  { Box, Text, Button }: TerminalElements,
  view: ContextView,
  dispatch: ContextControls["dispatch"],
): TerminalNode[] {
  const rows: TerminalNode[] = []
  if (view.bar.length > 0) {
    rows.push(Box({ flexDirection: "row", children: view.bar.map(({ kind, cells }) =>
      Text({ color: CATEGORY_COLORS[kind], children: ["█".repeat(cells)] }),
    ) }))
  }
  for (const { kind, text } of view.categories) {
    rows.push(Text({ color: CATEGORY_COLORS[kind], wrap: "truncate-middle", children: [text] }))
  }
  if (view.deferred.length > 0) {
    rows.push(Text({ weight: "bold", children: ["遅延読み込み（使用量に含めない）"] }))
    for (const text of view.deferred) {
      rows.push(Text({ color: CATEGORY_COLORS.deferred, wrap: "truncate-middle", children: [text] }))
    }
  }
  for (const group of view.groups) {
    const key = `session-rail-context-${group.kind}`
    rows.push(Button({ key, label: group.label, plain: true, onPress: () => dispatch({ kind: "toggle-group", group: group.kind }) }))
    for (const text of group.lines) {
      rows.push(Text({ wrap: "truncate-middle", children: [text] }))
    }
    if (group.range) {
      rows.push(Text({ dimColor: true, children: [group.range] }))
    }
    if (group.hasPrevious) {
      rows.push(Button({ key: `${key}-prev`, label: "‹ 前の項目", plain: true, onPress: () => dispatch({ kind: "page-group", group: group.kind, direction: -1 }) }))
    }
    if (group.hasNext) {
      rows.push(Button({ key: `${key}-next`, label: "次の項目 ›", plain: true, onPress: () => dispatch({ kind: "page-group", group: group.kind, direction: 1 }) }))
    }
  }
  return rows
}

function renderContextControls(ui: TerminalElements, controls: ContextControls | undefined, view: ContextView | null): TerminalNode[] {
  if (!controls) {
    return []
  }
  const { Button, Text } = ui
  const { snapshot, dispatch } = controls
  const rows: TerminalNode[] = [Button({
    key: "session-rail-context-toggle",
    label: snapshot.kind === "collapsed" ? "▸ 内訳を表示" : "▾ 内訳を閉じる",
    plain: true,
    onPress: () => dispatch({ kind: "toggle" }),
  })]
  if (snapshot.kind === "loading") {
    rows.push(Text({ dimColor: true, children: ["内訳を取得中"] }))
  }
  if (snapshot.kind === "unavailable") {
    rows.push(Text({ children: ["内訳を取得できません · /context で確認"] }))
  }
  if (view) {
    rows.push(...renderContextDetails(ui, view, dispatch))
  }
  return rows
}

function renderChangesControls(
  { Button, Link, Text }: TerminalElements,
  controls: ChangesControls | undefined,
  placement: "dock" | "inline",
): TerminalNode[] {
  if (!controls) {
    return []
  }
  const rows: TerminalNode[] = []
  if (controls.openLocalDiff) {
    rows.push(Button({ key: "session-rail-local-diff", label: "ローカル差分を開く (/diff)", plain: true, onPress: controls.openLocalDiff }))
  }
  const { pullRequest } = controls
  if (pullRequest.kind === "none" && placement === "dock") {
    rows.push(Text({ dimColor: true, children: ["このブランチに対応する PR はありません"] }))
  }
  if (pullRequest.kind === "unavailable") {
    rows.push(Text({ dimColor: true, children: ["PR を取得できません"] }))
  }
  if (pullRequest.kind !== "found") {
    return rows
  }
  const view = presentPullRequest(pullRequest.request)
  if (placement === "inline") {
    rows.push(Text({ wrap: "truncate-middle", children: [Link({ href: view.url, label: view.compact })] }))
    return rows
  }
  rows.push(
    Link({ href: view.url, label: view.link }),
    Text({ wrap: "truncate-middle", children: [view.title] }),
    Text({ children: [view.detail] }),
  )
  return rows
}

function renderOverview(
  ui: TerminalElements,
  { placement, columns }: PaneLayout,
  snapshot: RailSnapshot,
  controls?: OverviewControls,
) {
  const { Box, Text } = ui
  const [environment, context, changes] = presentRail(snapshot)
  const contextControls = controls?.context
  const view = contextControls?.snapshot.kind === "ready" ? presentContextBreakdown(contextControls.snapshot, columns) : null
  const contextRows = renderContextControls(ui, contextControls, view)
  const changesRows = renderChangesControls(ui, controls?.changes, placement)

  if (placement !== "dock") {
    const sections = [environment, { ...context, compact: view?.overview ?? context.compact }, changes]
    const rows = sections.map(({ label, compact }) =>
      Text({ wrap: "truncate-middle", children: [`${label}  ${compact}`] }),
    )
    return Box({ flexDirection: "column", children: [...rows, ...changesRows, ...contextRows] })
  }

  function section(label: string, detail: readonly string[], extra: readonly TerminalNode[] = []) {
    return Box({
      flexDirection: "column",
      children: [Text({ bold: true, children: [label] }), ...detail.map((line) => Text({ children: [line] })), ...extra],
    })
  }
  return Box({ flexDirection: "column", gap: 1, children: [
    section(environment.label, environment.detail),
    section(context.label, view ? [view.overview] : context.detail, contextRows),
    section(changes.label, changes.detail, changesRows),
  ] })
}

export function renderRailPane(ui: TerminalElements, layout: PaneLayout, snapshot: RailSnapshot, controls?: RailControls) {
  if (!controls) {
    return renderOverview(ui, layout, snapshot)
  }
  const { Box, Button } = ui
  const { tabs } = controls
  const header = Box({ flexDirection: "row", gap: 1, children: TABS.map(({ tab, label }) => Button({
    key: `session-rail-tab-${tab}`,
    label: tabs.active === tab ? `● ${label}` : label,
    plain: true,
    onPress: () => tabs.select(tab),
  })) })
  const body = tabs.active === "subagents" ? renderSubagentTab(ui, tabs.subagents) : renderOverview(ui, layout, snapshot, controls)
  return Box({ flexDirection: "column", children: [header, body] })
}
