import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import { ROOT, harness } from "./support/rail-harness.ts"

const URL = "https://github.com/owner/project/pull/7"
const DIFF = "session-rail-local-diff"
const pr = {
  number: 7, title: "PR title", url: URL, additions: 301, deletions: 4,
  state: "OPEN", isDraft: false, headRefName: "feature/rail",
  statusCheckRollup: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" }],
}

type Rail = ReturnType<typeof harness>
type Tree = Awaited<ReturnType<Rail["renderTree"]>>

function links(tree: Tree): string[] {
  if (tree.type === "Link" && tree.href) {
    return [tree.href]
  }
  return (tree.children ?? []).flatMap((child) => typeof child === "string" ? [] : links(child))
}

function delayPullRequest(rail: Rail) {
  const release = Promise.withResolvers<void>()
  const run = rail.api.process.run
  rail.api.process.run = async (args, options) => {
    const result = await run(args, options)
    if (args[0] === "gh") {
      await release.promise
    }
    return result
  }
  return release.resolve
}

async function open(rail: Rail): Promise<void> {
  await rail.fire("command.run", {})
  await setImmediate()
}

test("PR が遅くてもローカル差分は先に描画し、数値とリンクは後から別に出す", async () => {
  const rail = harness()
  rail.api.sessionState.gh = { ...rail.api.sessionState.gh, exitCode: 0, stdout: JSON.stringify(pr), stderr: "" }
  const release = delayPullRequest(rail)
  await open(rail)

  assert.equal(rail.api.ghCalls.length, 1)
  assert.equal(rail.api.ghCalls[0]?.cwd, ROOT)
  assert.ok((await rail.render("dock")).includes("+2 / −1"))
  assert.deepEqual(links(await rail.renderTree("dock")), [])
  release()
  await setImmediate()

  const dock = await rail.render("dock")
  assert.ok(dock.includes("+2 / −1"))
  assert.ok(dock.includes("PR 差分 +301 / −4 · CI 成功"))
  assert.deepEqual(links(await rail.renderTree("dock")), [URL])
  const inline = await rail.render("inline")
  assert.ok(inline.includes("変更  +2 / −1 · 未追跡 1件"))
  assert.ok(inline.includes("PR #7 · +301 / −4 · CI 成功"))
  assert.deepEqual(links(await rail.renderTree("inline")), [URL])
  assert.equal(rail.api.ghCalls.length, 1)
})

test("PR がない場合と GitHub CLI で取得できない場合を区別する", async () => {
  const rail = harness()
  await open(rail)
  assert.ok((await rail.render("dock")).includes("このブランチに対応する PR はありません"))
  rail.api.sessionState.gh = { ...rail.api.sessionState.gh, exitCode: 4, stderr: "authentication required" }
  await rail.fire("turn.complete", {})
  await setImmediate()

  const lines = await rail.render("dock")
  assert.ok(lines.includes("PR を取得できません"))
  assert.ok(lines.includes("+2 / −1"))
  assert.ok(!lines.includes("このブランチに対応する PR はありません"))
  assert.deepEqual(links(await rail.renderTree("dock")), [])
})

test("PR の取得中にブランチを切り替えたら古いカードは表示しない", async () => {
  const rail = harness()
  rail.api.sessionState.gh = { ...rail.api.sessionState.gh, exitCode: 0, stdout: JSON.stringify(pr), stderr: "" }
  const release = delayPullRequest(rail)
  await open(rail)
  rail.api.sessionState.branch = "feature/another"
  release()
  await setImmediate()
  assert.deepEqual(links(await rail.renderTree("dock")), [])
})

test("差分ボタンは /diff を呼び、起動できないときは手動実行を案内する", async () => {
  const rail = harness()
  await open(rail)
  await (await rail.buttonPress(DIFF))()
  assert.deepEqual(rail.api.commandRuns, ["diff"])
  assert.deepEqual(rail.api.toasts, [])

  rail.api.command.run = async () => { throw new Error("not supported") }
  await (await rail.buttonPress(DIFF, "inline"))()
  assert.deepEqual(rail.api.toasts, ["差分を直接開けません。プロンプトで /diff を実行してください。"])
})
