import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import type { AgentInfo, SessionUsage } from "claude-code"
import { CWD, harness } from "./support/rail-harness.ts"

const OVERVIEW = "session-rail-tab-overview"
const AGENTS = "session-rail-tab-subagents"
const REFRESH = "session-rail-subagents-refresh"

type Rail = ReturnType<typeof harness>

function agent(id: string, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id, type: "Explore", description: "更新処理の確認", label: "差分を比較しています", kind: "local_agent",
    status: "running", taskStatus: "running", startTime: 0, cwd: CWD, tokenCount: 0, tokenSamples: [], hasRow: true,
    ...overrides,
  }
}

async function open(rail: Rail): Promise<void> {
  await rail.fire("command.run", {})
  await setImmediate()
}

async function press(rail: Rail, key: string, placement: "dock" | "inline" = "dock"): Promise<void> {
  await (await rail.buttonPress(key, placement))()
  await setImmediate()
}

test("タブを選んだときだけ取得し、行の展開で会話や入力先を変えない", async () => {
  const rail = harness()
  rail.api.sessionState.agents = [
    agent("a", { name: "レビュー係" }),
    agent("b", { status: "waiting", label: "レポートを待っています" }),
    agent("team", { name: "team-only", kind: "in_process_teammate" }),
  ]
  await open(rail)
  assert.deepEqual(rail.api.agentListCalls, [])
  assert.ok((await rail.render("dock")).includes("● 概要"))

  await press(rail, AGENTS, "inline")
  const rows = await rail.render("dock")
  assert.ok(rows.includes("● サブエージェント"))
  assert.ok(rows.includes("サブエージェント 2件"))
  assert.ok(rows.includes("▸ 実行中 · レビュー係"))
  assert.ok(rows.includes("▸ 処理待ち · Explore"))
  assert.ok(rows.includes("タスク 更新処理の確認"))
  assert.ok(!rows.some((line) => line.includes("team-only") || line.includes("進捗") || line === "環境"))

  await press(rail, "session-rail-subagent-a")
  const detail = await rail.render("inline")
  assert.ok(detail.includes("進捗 差分を比較しています"))
  assert.ok(detail.includes("種別 Explore"))
  assert.ok(detail.includes("ID a"))
  assert.deepEqual(rail.api.viewChanges, [])
  assert.deepEqual(rail.api.commandRuns, [])
  assert.equal(rail.api.agentListCalls.length, 1)

  await press(rail, OVERVIEW)
  assert.ok((await rail.render("dock")).includes("環境"))
})

test("一覧表示中だけサブエージェントの開始・終了に追従し、概要の Git を読み直さない", async () => {
  const rail = harness()
  rail.api.sessionState.agents = [agent("a", { status: "pending" })]
  await open(rail)
  await rail.fire("turn.start", { agentId: "a" })
  await setImmediate()
  assert.deepEqual(rail.api.agentListCalls, [])

  await press(rail, AGENTS)
  const gitCount = rail.api.gitCalls.length
  assert.ok((await rail.render("dock")).includes("▸ 開始待ち · Explore"))
  rail.api.sessionState.agents = [agent("a")]
  await rail.fire("turn.start", { agentId: "a" })
  await setImmediate()
  assert.ok((await rail.render("dock")).includes("▸ 実行中 · Explore"))
  await press(rail, "session-rail-subagent-a")
  rail.api.sessionState.agents = [agent("a", { status: "completed", taskStatus: "completed" })]
  await rail.fire("turn.complete", { agentId: "a" })
  await setImmediate()
  assert.ok((await rail.render("dock")).includes("▾ 完了 · Explore"))
  assert.equal(rail.api.gitCalls.length, gitCount)
  assert.equal(rail.api.agentListCalls.length, 3)
})

test("一覧の取得失敗と空を区別し、再取得して概要へ戻れる", async () => {
  const rail = harness()
  const list = rail.api.agent.list
  rail.api.agent.list = async () => { throw new Error("agent list unavailable") }
  await open(rail)
  await press(rail, AGENTS)
  assert.ok((await rail.render("dock")).includes("サブエージェント一覧を取得できません"))

  rail.api.agent.list = list
  await press(rail, REFRESH)
  assert.ok((await rail.render("dock")).includes("このセッションにサブエージェントはいません"))
  await press(rail, OVERVIEW)
  assert.ok((await rail.render("inline")).includes("コンテキスト  21%"))
})

test("概要を待たずに表示し、ペインを閉じたときの遅い一覧を持ち越さない", async () => {
  const rail = harness()
  const usage = Promise.withResolvers<SessionUsage>()
  const agents = Promise.withResolvers<AgentInfo[]>()
  rail.api.session.usage = () => usage.promise
  rail.api.agent.list = () => agents.promise
  await open(rail)
  await press(rail, AGENTS)
  assert.ok((await rail.render("inline")).includes("サブエージェントを取得中"))

  await rail.fire("command.run", {})
  await open(rail)
  const redraws = [...rail.api.redraws]
  agents.resolve([agent("old", { name: "前の一覧" })])
  await setImmediate()
  assert.deepEqual(rail.api.redraws, redraws)
  const reopened = await rail.render("dock")
  assert.ok(reopened.includes("● 概要"))
  assert.ok(!reopened.some((line) => line.includes("前の一覧")))
  usage.resolve({ startedAt: 0, rateLimits: [], context: { tokens: 1, window: 100 } })
  await setImmediate()
})
