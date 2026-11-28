import type { EngineInterface } from "claude-code"
import { readGitSummary, type GitSummary } from "./git.ts"

type Source = Pick<EngineInterface, "session" | "process">

type Context =
  | { kind: "unmeasured" }
  | { kind: "unavailable" }
  | { kind: "ready"; tokens: number; window: number; percent: number }

export type Scope = { id: string | null; cwd: string | null }

export type RailSummary = {
  scope: Scope
  repository: string | null
  git: GitSummary
  context: Context
}

type Section = { label: string; compact: string; detail: readonly string[] }

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

export async function readScope(source: Source): Promise<Scope> {
  const [id, cwd] = await Promise.all([
    optional(() => source.session.id()),
    optional(() => source.session.cwd()),
  ])
  return { id, cwd }
}

export function sameScope(left: Scope, right: Scope): boolean {
  return left.id === right.id && left.cwd === right.cwd
}

function shortPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

async function readContext(source: Source): Promise<Context> {
  const usage = await optional(() => source.session.usage())
  if (!usage?.context) {
    return { kind: "unavailable" }
  }
  const { tokens, window, percent } = usage.context
  if (tokens === undefined) {
    return { kind: "unmeasured" }
  }
  if (!Number.isFinite(tokens) || tokens < 0 || !Number.isFinite(window) || window <= 0) {
    return { kind: "unavailable" }
  }
  const ratio = percent !== undefined && Number.isFinite(percent) ? percent : Math.round(tokens / window * 100)
  return { kind: "ready", tokens, window, percent: ratio }
}

async function readGit(source: Source, cwd: string | null): Promise<GitSummary> {
  if (!cwd) {
    return { kind: "unavailable" }
  }
  return readGitSummary(
    (args, dir) => source.process.run(["git", "--no-optional-locks", ...args], {
      cwd: dir,
      env: { LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
      timeoutMs: 2500,
    }),
    cwd,
  )
}

export async function readRailSummary(source: Source): Promise<RailSummary> {
  const scope = await readScope(source)
  const [repo, git, context] = await Promise.all([
    optional(() => source.session.repo()),
    readGit(source, scope.cwd),
    readContext(source),
  ])
  const repository = git.kind === "ready" ? repo?.name ?? shortPath(repo?.root ?? git.root) : null
  return { scope, repository, git, context }
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "�")
}

function section(label: string, compact: string, ...detail: string[]): Section {
  return { label, compact: oneLine(compact), detail: (detail.length > 0 ? detail : [compact]).map(oneLine) }
}

function presentEnvironment({ scope, git, repository }: RailSummary): Section {
  const cwd = scope.cwd ?? "作業フォルダを取得できません"
  if (git.kind !== "ready") {
    const reason = git.kind === "outside" ? "Git 管理外" : "Git 情報を取得できません"
    return section("環境", scope.cwd ? `${shortPath(scope.cwd)} · ${reason}` : reason, cwd, reason)
  }

  const header = `${repository ?? shortPath(git.root)} · ${git.branch}`
  if (git.root !== scope.cwd) {
    return section("環境", header, header, cwd, `worktree ${git.root}`)
  }
  return section("環境", header, header, cwd)
}

function presentContext(context: Context): Section {
  if (context.kind === "unmeasured") {
    return section("コンテキスト", "未計測")
  }
  if (context.kind === "unavailable") {
    return section("コンテキスト", "取得不可")
  }
  const percent = `${context.percent}%`
  return section("コンテキスト", percent, `${percent} · ${context.tokens.toLocaleString("en-US")} / ${context.window.toLocaleString("en-US")} tokens`)
}

function presentChanges(git: GitSummary): Section {
  if (git.kind === "outside") {
    return section("変更", "Git 管理外")
  }
  if (git.kind === "unavailable") {
    return section("変更", "取得不可")
  }
  if (git.tracked === 0 && git.untracked === 0) {
    return section("変更", "変更なし")
  }

  const count = `未コミット ${git.tracked}件 · 未追跡 ${git.untracked}件`
  if (git.tracked === 0) {
    return section("変更", `未追跡 ${git.untracked}件`, count)
  }
  if (!git.lines) {
    return section("変更", count, count, "行数を取得できません")
  }

  const lineCount = `+${git.lines.added} / −${git.lines.deleted}`
  if (git.lines.added === 0 && git.lines.deleted === 0) {
    const withoutText = git.lines.binary > 0 ? `バイナリ ${git.lines.binary}件` : "テキストの行差分なし"
    return section("変更", count, count, withoutText)
  }
  const detail = git.lines.binary > 0 ? `${lineCount} · バイナリ ${git.lines.binary}件` : lineCount
  return section("変更", `${lineCount} · 未追跡 ${git.untracked}件`, count, detail)
}

export function presentRail(summary: RailSummary | undefined): readonly Section[] {
  if (!summary) {
    return ["環境", "コンテキスト", "変更"].map((label) => section(label, "読み込み中"))
  }
  return [presentEnvironment(summary), presentContext(summary.context), presentChanges(summary.git)]
}
