import type { RailSnapshot } from "../../application/rail-summary-state/rail-summary-state.ts"
import type { ContextUsage } from "../../domain/context-usage/context-usage.ts"
import type { RailSummary } from "../../domain/session-summary.ts"
import type { Checkout, WorktreeSummary } from "../../domain/worktree.ts"

type Section = { label: string; compact: string; detail: readonly string[] }

function shortPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "�")
}

function section(label: string, compact: string, ...detail: string[]): Section {
  return { label, compact: oneLine(compact), detail: (detail.length > 0 ? detail : [compact]).map(oneLine) }
}

function checkoutLabel(checkout: Checkout): string {
  return checkout.kind === "branch" ? checkout.name : `detached HEAD ${checkout.oid.slice(0, 7)}`
}

function presentEnvironment({ scope, worktree, repository }: RailSummary): Section {
  const cwd = scope.cwd ?? "作業フォルダを取得できません"
  if (worktree.kind !== "ready") {
    const reason = worktree.kind === "outside" ? "Git 管理外" : "Git 情報を取得できません"
    return section("環境", scope.cwd ? `${shortPath(scope.cwd)} · ${reason}` : reason, cwd, reason)
  }

  const name = repository?.name ?? shortPath(repository?.root ?? worktree.root)
  const header = `${name} · ${checkoutLabel(worktree.checkout)}`
  if (worktree.root !== scope.cwd) {
    return section("環境", header, header, cwd, `worktree ${worktree.root}`)
  }
  return section("環境", header, header, cwd)
}

function presentContext(context: ContextUsage): Section {
  if (context.kind === "unmeasured") {
    return section("コンテキスト", "未計測")
  }
  if (context.kind === "unavailable") {
    return section("コンテキスト", "取得不可")
  }
  const percent = `${context.percent}%`
  return section("コンテキスト", percent, `${percent} · ${context.tokens.toLocaleString("en-US")} / ${context.window.toLocaleString("en-US")} tokens`)
}

function presentChanges(worktree: WorktreeSummary): Section {
  if (worktree.kind === "outside") {
    return section("変更", "Git 管理外")
  }
  if (worktree.kind === "unavailable") {
    return section("変更", "取得不可")
  }
  const { changes } = worktree
  if (changes.kind === "clean") {
    return section("変更", "変更なし")
  }
  if (changes.kind === "untracked-only") {
    return section("変更", `未追跡 ${changes.untracked}件`, `未コミット 0件 · 未追跡 ${changes.untracked}件`)
  }

  const { tracked, untracked, diff } = changes
  const count = `未コミット ${tracked}件 · 未追跡 ${untracked}件`
  if (diff.kind === "unavailable") {
    return section("変更", count, count, "行数を取得できません")
  }
  if (diff.kind === "no-text") {
    const withoutText = diff.binary > 0 ? `バイナリ ${diff.binary}件` : "テキストの行差分なし"
    return section("変更", count, count, withoutText)
  }

  const { added, deleted, binary } = diff
  const lineCount = `+${added} / −${deleted}`
  const detail = binary > 0 ? `${lineCount} · バイナリ ${binary}件` : lineCount
  return section("変更", `${lineCount} · 未追跡 ${untracked}件`, count, detail)
}

export function presentRail(snapshot: RailSnapshot): readonly [Section, Section, Section] {
  if (snapshot.kind === "pending") {
    return [section("環境", "読み込み中"), section("コンテキスト", "読み込み中"), section("変更", "読み込み中")]
  }
  const { summary } = snapshot
  return [presentEnvironment(summary), presentContext(summary.context), presentChanges(summary.worktree)]
}
