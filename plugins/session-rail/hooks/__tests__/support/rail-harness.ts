import assert from "node:assert/strict"
import type { CommandSpec, On, PaneOpenArgs, SessionUsage, UiOpenResult } from "claude-code"
import { register } from "../../register.ts"

export const PANE_ID = "claude-mods-lab-session-rail"
const OID = "a".repeat(40)
export const CWD = "/workspace/rail-worktree/src"
export const ROOT = "/workspace/rail-worktree"

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

export function harness(openResult: UiOpenResult = { isPlaced: true }) {
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

export function paneRender(placement: "dock" | "inline") {
  return { requestId: PANE_ID, surface: "terminal", props: { placement } }
}
