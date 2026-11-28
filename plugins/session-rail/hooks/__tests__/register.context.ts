import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import type { SessionContextBreakdown } from "claude-code"
import { harness } from "./support/rail-harness.ts"

const TOGGLE = "session-rail-context-toggle"
const MCP_GROUP = "session-rail-context-mcp-tools"

const breakdown: SessionContextBreakdown = {
  totalTokens: 24_000,
  rawMaxTokens: 80_000,
  maxTokens: 80_000,
  percentage: 30,
  gridRows: [],
  autocompactSource: "model-default",
  model: "test",
  categories: [
    { kind: "used", name: "Messages", tokens: 24_000, color: "green", isDeferred: false },
    { kind: "buffer", name: "Reserve", tokens: 8_000, color: "yellow", isDeferred: false },
    { kind: "free", name: "Free", tokens: 48_000, color: "gray", isDeferred: false },
    { kind: "deferred", name: "Tool schemas", tokens: 5_000, color: "gray", isDeferred: true },
  ],
  agents: [],
  mcpTools: [],
  memoryFiles: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

type Rail = ReturnType<typeof harness>

async function open(rail: Rail): Promise<void> {
  await rail.fire("command.run", {})
  await setImmediate()
}

async function press(rail: Rail, key: string, placement: "dock" | "inline" = "dock"): Promise<void> {
  const onPress = await rail.buttonPress(key, placement)
  onPress()
  await setImmediate()
}

test("展開時だけ内訳を取得し、折りたたむと通常の使用量に戻る", async () => {
  const rail = harness()
  rail.api.sessionState.breakdown = breakdown
  await open(rail)
  assert.ok((await rail.render("dock")).includes("21% · 42,000 / 200,000 tokens"))
  assert.deepEqual(rail.api.usageCalls, [undefined])
  const gitCalls = rail.api.gitCalls.length

  await press(rail, TOGGLE, "inline")
  const dock = await rail.render("dock")
  assert.ok(dock.includes("推計 30% · 24,000 / 80,000 tokens"))
  assert.ok(dock.includes("Messages  24,000 · 30%"))
  assert.ok(dock.includes("Reserve  8,000 · 10%"))
  assert.ok(dock.includes("遅延読み込み（使用量に含めない）"))
  assert.ok(dock.includes("Tool schemas  5,000"))
  assert.ok(!dock.some((line) => line.includes("200,000")))
  assert.ok((await rail.render("inline")).includes("コンテキスト  推計 30% · 24,000 / 80,000 tokens"))
  assert.deepEqual(rail.api.usageCalls, [undefined, { breakdown: "summary" }])
  assert.equal(rail.api.gitCalls.length, gitCalls)

  await press(rail, TOGGLE)
  assert.ok((await rail.render("dock")).includes("21% · 42,000 / 200,000 tokens"))
  assert.equal(rail.api.usageCalls.length, 2)
})

test("内訳がなくても通常の使用量と他の項目を残し、/context を案内する", async () => {
  const rail = harness()
  await open(rail)
  await press(rail, TOGGLE)
  const text = await rail.render("dock")
  assert.ok(text.includes("内訳を取得できません · /context で確認"))
  assert.ok(text.includes("21% · 42,000 / 200,000 tokens"))
  assert.ok(text.includes("変更"))
})

test("返却された項目だけを展開でき、長い MCP 一覧を追加取得なしで送れる", async () => {
  const rail = harness()
  rail.api.sessionState.breakdown = {
    ...breakdown,
    mcpTools: Array.from({ length: 13 }, (_, index) => ({
      name: `tool-${index + 1}`, serverName: "fixture", tokens: 10, isLoaded: index < 12,
    })),
    memoryFiles: [{ path: "/project/CLAUDE.md", type: "Project", tokens: 12 }],
  }
  await open(rail)
  await press(rail, TOGGLE)
  const collapsedGroups = await rail.render("dock")
  assert.ok(collapsedGroups.includes("▸ MCP ツール 13件"))
  assert.ok(collapsedGroups.includes("▸ メモリファイル 1件"))
  assert.ok(!collapsedGroups.some((line) => line.includes("カスタムエージェント") || line.includes("tool-1")))

  await press(rail, MCP_GROUP)
  const firstPage = await rail.render("dock")
  assert.ok(firstPage.includes("tool-12  10"))
  assert.ok(firstPage.includes("1–12 / 13件"))
  assert.ok(!firstPage.some((line) => line.includes("tool-13")))
  await press(rail, `${MCP_GROUP}-next`)
  const secondPage = await rail.render("dock")
  assert.ok(secondPage.includes("tool-13  10（遅延）"))
  assert.ok(secondPage.includes("13–13 / 13件"))
  assert.ok(!secondPage.includes("tool-12  10"))
  await press(rail, `${MCP_GROUP}-prev`)
  assert.ok((await rail.render("dock")).includes("tool-1  10"))
  assert.equal(rail.api.usageCalls.length, 2)
})

test("折りたたみ前の遅い読み込みが、開き直した内訳を上書きしない", async () => {
  const rail = harness()
  rail.api.sessionState.breakdown = breakdown
  await open(rail)
  const usage = rail.api.session.usage
  const oldRead = Promise.withResolvers<void>()
  let hold = true
  rail.api.session.usage = async (args) => {
    const result = await usage(args)
    if (hold && args?.breakdown === "summary") {
      hold = false
      await oldRead.promise
    }
    return result
  }

  await press(rail, TOGGLE)
  assert.ok((await rail.render("dock")).includes("内訳を取得中"))
  await press(rail, TOGGLE)
  rail.api.sessionState.breakdown = { ...breakdown, totalTokens: 32_000 }
  await press(rail, TOGGLE)
  oldRead.resolve()
  await setImmediate()
  assert.ok((await rail.render("dock")).includes("推計 40% · 32,000 / 80,000 tokens"))
})

test("メインターンで開いている内訳を更新し、作業先が変わったら折りたたむ", async () => {
  const rail = harness()
  rail.api.sessionState.breakdown = breakdown
  await open(rail)
  await press(rail, TOGGLE)
  const oldPress = await rail.buttonPress(TOGGLE)
  await rail.fire("turn.complete", { agentId: "other" })
  await setImmediate()
  assert.equal(rail.api.usageCalls.length, 2)

  await rail.fire("turn.complete", {})
  await setImmediate()
  assert.deepEqual(rail.api.usageCalls.slice(2), [undefined, { breakdown: "summary" }])

  rail.api.sessionState.cwd = "/workspace/another"
  await rail.fire("turn.complete", {})
  await setImmediate()
  oldPress()
  await setImmediate()
  assert.deepEqual(rail.api.usageCalls.slice(4), [undefined])
  const text = await rail.render("dock")
  assert.ok(text.includes("▸ 内訳を表示"))
  assert.ok(!text.some((line) => line.includes("推計")))
})

test("閉じたペインの操作や読み込み結果を開き直したペインに持ち越さない", async () => {
  const rail = harness()
  const late = Promise.withResolvers<SessionContextBreakdown>()
  const usage = rail.api.session.usage
  rail.api.session.usage = async (args) => {
    const result = await usage(args)
    if (args?.breakdown === "summary") {
      return { ...result, context: { ...result.context, breakdown: await late.promise } }
    }
    return result
  }
  await open(rail)
  const oldPress = await rail.buttonPress(TOGGLE)
  oldPress()
  await setImmediate()
  await rail.fire("command.run", {})
  await open(rail)
  late.resolve(breakdown)
  oldPress()
  await setImmediate()
  assert.deepEqual(rail.api.usageCalls, [undefined, { breakdown: "summary" }, undefined])
  const text = await rail.render("dock")
  assert.ok(text.includes("▸ 内訳を表示"))
  assert.ok(!text.some((line) => line.includes("推計")))
})
