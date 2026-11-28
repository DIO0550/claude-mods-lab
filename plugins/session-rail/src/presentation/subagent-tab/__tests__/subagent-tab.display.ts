import assert from "node:assert/strict"
import test from "node:test"
import { presentSubagent } from "../subagent-tab.ts"

test("ホストからの文字列を1行に収め、詳細を開いた行だけに進捗を出す", () => {
  const agent = { id: "a", name: "Agent\nName", type: "Explore", task: "タスク\r説明", progress: "詳細\n進捗", status: "unknown" } as const
  assert.deepEqual(presentSubagent(agent, false), {
    title: "▸ 状態不明 · Agent�Name", task: "タスク タスク�説明", details: [],
  })
  assert.deepEqual(presentSubagent(agent, true).details, ["種別 Explore", "進捗 詳細�進捗", "ID a"])
})
