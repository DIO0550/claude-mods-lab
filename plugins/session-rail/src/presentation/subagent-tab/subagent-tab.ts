import type { Elements } from "claude-code"
import type { SubagentAction, SubagentListSnapshot } from "../../application/subagent-list-state/subagent-list-state.ts"
import type { Subagent } from "../../domain/subagent/subagent.ts"
import { oneLine } from "../rail-view/rail-view.ts"

export type SubagentTabControls = { snapshot: SubagentListSnapshot; dispatch(action: SubagentAction): void }

const STATUS = {
  pending: "開始待ち", running: "実行中", waiting: "処理待ち", idle: "待機中",
  completed: "完了", failed: "失敗", killed: "停止", unknown: "状態不明",
}

export function presentSubagent(agent: Subagent, expanded: boolean) {
  const title = `${expanded ? "▾" : "▸"} ${STATUS[agent.status]} · ${oneLine(agent.name)}`
  const task = agent.task ? `タスク ${oneLine(agent.task)}` : "タスク未設定"
  const details: string[] = []
  if (expanded) {
    if (agent.type) {
      details.push(`種別 ${oneLine(agent.type)}`)
    }
    if (agent.progress) {
      details.push(`進捗 ${oneLine(agent.progress)}`)
    }
    details.push(`ID ${oneLine(agent.id)}`)
  }
  return { title, task, details }
}

export function renderSubagentTab(
  { Box, Button, Text }: Pick<Elements["terminal"], "Box" | "Button" | "Text">,
  { snapshot, dispatch }: SubagentTabControls,
) {
  const refresh = Button({ key: "session-rail-subagents-refresh", label: "一覧を更新", plain: true, onPress: () => dispatch({ kind: "refresh" }) })
  if (snapshot.kind !== "ready") {
    const message = snapshot.kind === "loading" ? "サブエージェントを取得中" : "サブエージェント一覧を取得できません"
    return Box({ flexDirection: "column", children: [Text({ children: [message] }), refresh] })
  }
  if (snapshot.agents.length === 0) {
    return Box({ flexDirection: "column", children: [Text({ children: ["このセッションにサブエージェントはいません"] }), refresh] })
  }

  const rows = snapshot.agents.map((agent) => {
    const expanded = snapshot.expandedId === agent.id
    const row = presentSubagent(agent, expanded)
    return Box({ flexDirection: "column", children: [
      Button({ key: `session-rail-subagent-${agent.id}`, label: row.title, plain: true, onPress: () => dispatch({ kind: "toggle-details", agentId: agent.id }) }),
      Text({ wrap: expanded ? "wrap" : "truncate-middle", children: [row.task] }),
      ...row.details.map((text) => Text({ children: [text] })),
    ] })
  })
  return Box({ flexDirection: "column", children: [
    Text({ dimColor: true, children: [`サブエージェント ${snapshot.agents.length}件`] }), refresh, ...rows,
  ] })
}
