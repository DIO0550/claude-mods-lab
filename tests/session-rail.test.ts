import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import type { CommandSpec, On, PaneOpenArgs, SessionUsage, UiOpenResult } from "claude-code"
import { register } from "../plugins/session-rail/hooks/register.ts"

const PANE_ID = "claude-mods-lab-session-rail"
const OID = "a".repeat(40)
const CWD = "/workspace/rail-worktree/src"
const ROOT = "/workspace/rail-worktree"

type Tree = {
  type: "Box" | "Text"
  children?: readonly (Tree | string)[]
}

type Hook = (
  api: ReturnType<typeof createApi>,
  event: Record<string, unknown>,
  next: (event: Record<string, unknown>) => unknown,
) => unknown

function createApi(openResult: UiOpenResult) {
  const commands: CommandSpec[] = []
  const openPanes = new Set<string>()
  const opens: PaneOpenArgs[] = []
  const closes: string[] = []
  const redraws: string[] = []
  const gitCalls: Array<{ args: readonly string[]; cwd?: string }> = []
  const sessionState = { id: "session-a", cwd: CWD, usage: { tokens: 42_000, window: 200_000, percent: 21 } }
  const output = (stdout: string) => ({ stdout, stderr: "", exitCode: 0, isStdoutTruncated: false })

  return {
    commands,
    openPanes,
    opens,
    closes,
    redraws,
    gitCalls,
    sessionState,
    session: {
      async id() { return sessionState.id },
      async cwd() { return sessionState.cwd },
      async repo() { return { name: null, root: "/workspace/project" } },
      async usage(): Promise<SessionUsage> {
        return { startedAt: 0, rateLimits: [], context: sessionState.usage }
      },
    },
    process: {
      async run(args: readonly string[], options: { cwd?: string }) {
        gitCalls.push({ args, cwd: options.cwd })
        if (args.includes("--show-toplevel")) {
          const root = options.cwd === CWD ? ROOT : options.cwd ?? ROOT
          return output(`${root}\n`)
        }
        if (args.includes("--porcelain=v2")) {
          return output([`# branch.oid ${OID}`, "# branch.head feature/rail", "1 .M fake", "? new.txt", ""].join("\0"))
        }
        if (args.includes("--numstat")) {
          return output("2\t1\tsample.txt\0")
        }
        assert.ok(args.includes("--symbolic-full-name"))
        return output(`${OID}\nrefs/heads/feature/rail\n`)
      },
    },
    command: {
      async register(spec: CommandSpec) {
        commands.push(spec)
        return { command: spec.name }
      },
    },
    ui: {
      async panes() {
        return [...openPanes].map((id) => ({ id, isPlaced: openResult.isPlaced }))
      },
      async open(args: PaneOpenArgs) {
        opens.push(args)
        openPanes.add(args.id)
        return openResult
      },
      async close({ id }: { id: string }) {
        closes.push(id)
        openPanes.delete(id)
      },
      invalidate(event: string) {
        redraws.push(event)
      },
      resolve() {
        return {
          Box: (props: Omit<Tree, "type">): Tree => ({ type: "Box", ...props }),
          Text: (props: Omit<Tree, "type">): Tree => ({ type: "Text", ...props }),
        }
      },
    },
  }
}

function harness(openResult: UiOpenResult = { isPlaced: true }) {
  const api = createApi(openResult)
  const hooks = new Map<string, { selector?: Record<string, string>; handle: Hook }>()
  const on = (event: string, selectorOrHook: Record<string, string> | Hook, handle?: Hook) => {
    if (typeof selectorOrHook === "function") {
      hooks.set(event, { handle: selectorOrHook })
      return
    }
    assert.ok(handle)
    hooks.set(event, { selector: selectorOrHook, handle })
  }
  register(on as unknown as On)

  return {
    api,
    hooks,
    async render(placement: "dock" | "inline") {
      const hook = hooks.get("ui.render")
      assert.ok(hook)
      return lines(await hook.handle(api, paneRender(placement), () => undefined) as Tree)
    },
    async fire(event: string, input: Record<string, unknown>) {
      const hook = hooks.get(event)
      assert.ok(hook, `missing hook for ${event}`)
      return hook.handle(api, input, (forwarded) => ({ forwarded }))
    },
  }
}

function lines(tree: Tree): string[] {
  return (tree.children ?? []).flatMap((child) => typeof child === "string" ? [child] : lines(child))
}

function paneRender(placement: "dock" | "inline") {
  return { requestId: PANE_ID, surface: "terminal", props: { placement } }
}

test("対話ターミナルのセッションに /rail を登録する", async () => {
  const { api, fire, hooks } = harness()
  const event = { isInteractive: true, surface: "terminal" }

  assert.deepEqual(await fire("session.start", event), { forwarded: event })
  assert.equal(api.commands.length, 1)
  assert.equal(api.commands[0]?.name, "rail")
  assert.equal(api.commands[0]?.immediate, true)
  assert.equal(api.commands[0]?.isTerminalOnly, true)
  assert.deepEqual(hooks.get("command.run")?.selector, { command: "rail" })
  assert.deepEqual(hooks.get("ui.render")?.selector, { component: "Pane" })
})

test("非対話セッションと Desktop には登録しない", async () => {
  const { api, fire } = harness()
  await fire("session.start", { isInteractive: false, surface: null })
  await fire("session.start", { isInteractive: true, surface: "desktop" })
  assert.deepEqual(api.commands, [])
})

test("/rail の再実行では自分のペインだけを閉じる", async () => {
  const { api, fire } = harness()
  api.openPanes.add("another-pane")

  assert.deepEqual(await fire("command.run", {}), {})
  assert.equal(api.opens[0]?.id, PANE_ID)
  assert.equal(api.opens[0]?.closeOnEscape, true)
  assert.equal(api.opens[0]?.focus, undefined)
  assert.deepEqual(await fire("command.run", {}), {})
  assert.deepEqual(api.closes, [PANE_ID])
  assert.deepEqual([...api.openPanes], ["another-pane"])
})

test("ユーザーが端末側で閉じた後も /rail で開ける", async () => {
  const { api, fire } = harness()
  await fire("command.run", {})
  api.openPanes.delete(PANE_ID)

  await fire("command.run", {})
  assert.equal(api.opens.length, 2)
  assert.deepEqual(api.closes, [])
  assert.ok(api.openPanes.has(PANE_ID))
})

test("ペインを配置できないときは理由を表示する", async () => {
  const { fire } = harness({ isPlaced: false, reason: "no-surface" })
  assert.deepEqual(await fire("command.run", {}), {
    text: "セッションペインはまだ表示されていません（no-surface）。",
  })
})

test("右ペインは読み込み後に現在のセッションと worktree を表示する", async () => {
  const { api, fire, render } = harness()
  assert.ok((await render("dock")).includes("読み込み中"))
  await fire("command.run", {})
  await setImmediate()

  assert.deepEqual(await render("dock"), [
    "環境",
    "project · feature/rail",
    CWD,
    `worktree ${ROOT}`,
    "コンテキスト",
    "21% · 42,000 / 200,000 tokens",
    "変更",
    "未コミット 1件 · 未追跡 1件",
    "+2 / −1",
  ])
  assert.deepEqual(api.redraws, ["ui.render"])
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
    "環境  project · feature/rail",
    "コンテキスト  21%",
    "変更  +2 / −1 · 未追跡 1件",
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
    "環境", CWD, "Git 情報を取得できません", "コンテキスト", "未計測", "変更", "取得不可",
  ])
})

test("コンテキストを取得できない場合も、Git 情報は表示する", async () => {
  const { api, fire, render } = harness()
  api.session.usage = async () => { throw new Error("usage is unavailable") }
  await fire("command.run", {})
  await setImmediate()
  assert.deepEqual(await render("inline"), [
    "環境  project · feature/rail", "コンテキスト  取得不可", "変更  +2 / −1 · 未追跡 1件",
  ])
})

test("メインのターン終了時にだけ、開いているペインを更新する", async () => {
  const { api, fire, render } = harness()
  await fire("turn.complete", {})
  await setImmediate()
  assert.deepEqual(api.gitCalls, [])
  await fire("command.run", {})
  await setImmediate()

  api.sessionState.usage = { tokens: 0, window: 200_000, percent: 0 }
  await fire("turn.complete", { agentId: "subagent" })
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  21%"))
  await fire("turn.complete", {})
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  0%"))
})

test("閉じる前の遅い取得結果を、新しく開いたペインへ渡さない", async () => {
  const { api, fire, render } = harness()
  const delayed = Promise.withResolvers<SessionUsage>()
  const readUsage = api.session.usage
  api.session.usage = () => delayed.promise
  await fire("command.run", {})
  await setImmediate()
  api.openPanes.delete(PANE_ID)
  await fire("ui.close", { id: PANE_ID })
  api.session.usage = readUsage
  api.sessionState.usage = { tokens: 60_000, window: 200_000, percent: 30 }
  await fire("command.run", {})
  await setImmediate()

  delayed.resolve({ startedAt: 0, rateLimits: [], context: { tokens: 1, window: 100, percent: 1 } })
  await setImmediate()
  assert.ok((await render("inline")).includes("コンテキスト  30%"))
  assert.deepEqual(api.redraws, ["ui.render"])
})

test("取得中に作業フォルダが変わったら、現在の作業先を読み直す", async () => {
  const { api, fire, render } = harness()
  const delayed = Promise.withResolvers<SessionUsage>()
  const readUsage = api.session.usage
  api.session.usage = () => delayed.promise
  await fire("command.run", {})
  await setImmediate()
  api.sessionState.cwd = "/workspace/other-worktree"
  api.sessionState.usage = { tokens: 63_000, window: 200_000, percent: 32 }
  api.session.usage = readUsage
  delayed.resolve({ startedAt: 0, rateLimits: [], context: { tokens: 20, window: 100, percent: 20 } })
  await setImmediate()
  const detail = await render("dock")
  assert.ok(!detail.includes(CWD))
  assert.ok(detail.includes(api.sessionState.cwd))
  assert.ok(detail.includes("32% · 63,000 / 200,000 tokens"))
})

test("セッション終了時は前の利用量を消す", async () => {
  const { fire, render } = harness()
  await fire("command.run", {})
  await setImmediate()
  await fire("session.end", {})
  assert.ok((await render("inline")).includes("コンテキスト  読み込み中"))
})
