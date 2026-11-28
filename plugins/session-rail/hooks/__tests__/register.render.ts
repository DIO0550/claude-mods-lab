import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import { CWD, ROOT, harness, paneRender } from "./support/rail-harness.ts"

test("右ペインは読み込み後に現在のセッションと worktree を表示する", async () => {
  const { api, fire, render } = harness()
  assert.ok((await render("dock")).includes("読み込み中"))
  await fire("command.run", {})
  await setImmediate()

  assert.deepEqual(await render("dock"), [
    "● 概要",
    "サブエージェント",
    "環境",
    "project · feature/rail",
    CWD,
    `worktree ${ROOT}`,
    "コンテキスト",
    "21% · 42,000 / 200,000 tokens",
    "▸ 内訳を表示",
    "変更",
    "未コミット 1件 · 未追跡 1件",
    "+2 / −1",
    "ローカル差分を開く (/diff)",
    "このブランチに対応する PR はありません",
  ])
  assert.deepEqual(api.redraws, ["ui.render", "ui.render"])
  assert.equal(api.gitCalls[0]?.cwd, CWD)
  assert.ok(api.gitCalls.slice(1).every(({ cwd }) => cwd === ROOT))
  const calls = api.gitCalls.length
  await render("dock")
  assert.equal(api.gitCalls.length, calls)
})

test("入力欄上では 3 セクションを要約する", async () => {
  const { fire, render } = harness()
  await fire("command.run", {})
  await setImmediate()
  assert.deepEqual(await render("inline"), [
    "● 概要",
    "サブエージェント",
    "環境  project · feature/rail",
    "コンテキスト  21%",
    "変更  +2 / −1 · 未追跡 1件",
    "ローカル差分を開く (/diff)",
    "▸ 内訳を表示",
  ])
})

test("別の ID と描画サーフェスには干渉しない", async () => {
  const { fire } = harness()
  const differentPane = { ...paneRender("dock"), requestId: "other" }
  const desktop = { ...paneRender("dock"), surface: "desktop" }
  assert.deepEqual(await fire("ui.render", differentPane), { forwarded: differentPane })
  assert.deepEqual(await fire("ui.render", desktop), { forwarded: desktop })
})

test("未計測と取得不可を分け、Git が起動できなくても他の項目を出す", async () => {
  const { api, fire, render } = harness()
  api.session.usage = async () => ({ startedAt: 0, rateLimits: [], context: { window: 200_000 } })
  api.process.run = async () => { throw new Error("git is unavailable") }
  await fire("command.run", {})
  await setImmediate()
  assert.deepEqual(await render("dock"), [
    "● 概要", "サブエージェント",
    "環境", CWD, "Git 情報を取得できません", "コンテキスト", "未計測", "▸ 内訳を表示", "変更", "取得不可",
  ])
})

test("コンテキストを取得できない場合も、Git 情報は表示する", async () => {
  const { api, fire, render } = harness()
  api.session.usage = async () => { throw new Error("usage is unavailable") }
  await fire("command.run", {})
  await setImmediate()
  assert.deepEqual(await render("inline"), [
    "● 概要", "サブエージェント",
    "環境  project · feature/rail", "コンテキスト  取得不可", "変更  +2 / −1 · 未追跡 1件", "ローカル差分を開く (/diff)", "▸ 内訳を表示",
  ])
})
