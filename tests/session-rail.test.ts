import assert from "node:assert/strict"
import test from "node:test"
import type { CommandSpec, On, PaneOpenArgs, UiOpenResult } from "claude-code"
import { register } from "../plugins/session-rail/hooks/register.ts"

const PANE_ID = "claude-mods-lab-session-rail"

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

  return {
    commands,
    openPanes,
    opens,
    closes,
    command: {
      async register(spec: CommandSpec) {
        commands.push(spec)
        return { command: spec.name }
      },
    },
    ui: {
      async panes() {
        return [...openPanes].map((id) => ({ id }))
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

test("右ペインには固定データであることと 3 セクションを表示する", async () => {
  const { fire } = harness()
  const tree = await fire("ui.render", paneRender("dock")) as Tree

  assert.deepEqual(lines(tree), [
    "プレビュー · 固定データ",
    "環境",
    "~/work/example · main",
    "コンテキスト",
    "28% · 28.1万 / 100万",
    "変更",
    "未コミット +18 / −4",
  ])
})

test("入力欄上では 3 セクションを要約する", async () => {
  const { fire } = harness()
  const tree = await fire("ui.render", paneRender("inline")) as Tree
  assert.deepEqual(lines(tree), [
    "プレビュー · 固定データ",
    "環境  main",
    "コンテキスト  28%",
    "変更  +18 / −4",
  ])
})

test("別の ID と描画サーフェスには干渉しない", async () => {
  const { fire } = harness()
  const differentPane = { ...paneRender("dock"), requestId: "other" }
  const desktop = { ...paneRender("dock"), surface: "desktop" }
  assert.deepEqual(await fire("ui.render", differentPane), { forwarded: differentPane })
  assert.deepEqual(await fire("ui.render", desktop), { forwarded: desktop })
})
