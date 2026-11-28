import { CONTEXT_ITEMS_PER_PAGE, type ContextBreakdownSnapshot } from "../../application/context-breakdown-state/context-breakdown-state.ts"
import type { ContextBucket } from "../../domain/context-breakdown/context-breakdown.ts"
import { oneLine } from "../rail-view/rail-view.ts"

const BAR_BUCKETS: readonly ContextBucket[] = ["used", "buffer", "free"]
const GROUP_LABELS = { "mcp-tools": "MCP ツール", "memory-files": "メモリファイル", agents: "カスタムエージェント" }

function formatPercent(tokens: number, window: number): string {
  return `${(tokens / window * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`
}

function formatTokens(tokens: number): string {
  return tokens.toLocaleString("en-US")
}

export function presentContextBreakdown(
  { breakdown, group: expanded }: Extract<ContextBreakdownSnapshot, { kind: "ready" }>,
  columns: number,
) {
  const { window, buckets, categories, groups } = breakdown
  const width = Number.isFinite(columns) ? Math.min(40, Math.max(0, Math.floor(columns))) : 24
  let before = 0
  let cumulative = 0
  const bar = BAR_BUCKETS.map((kind) => {
    cumulative += buckets[kind]
    const end = Math.min(width, Math.round(cumulative / window * width))
    const cells = end - before
    before = end
    return { kind, cells }
  }).filter(({ cells }) => cells > 0)

  return {
    overview: `推計 ${formatPercent(buckets.used, window)} · ${formatTokens(buckets.used)} / ${formatTokens(window)} tokens`,
    bar,
    categories: categories.filter(({ kind }) => kind !== "deferred").map(({ kind, name, tokens }) => ({
      kind, text: `${oneLine(name)}  ${formatTokens(tokens)} · ${formatPercent(tokens, window)}`,
    })),
    deferred: categories.filter(({ kind }) => kind === "deferred").map(({ name, tokens }) =>
      `${oneLine(name)}  ${formatTokens(tokens)}`,
    ),
    groups: groups.map(({ kind, items }) => {
      const isExpanded = expanded?.kind === kind
      const offset = isExpanded ? expanded.offset : 0
      const visibleItems = isExpanded ? items.slice(offset, offset + CONTEXT_ITEMS_PER_PAGE) : []
      return {
        kind,
        label: `${isExpanded ? "▾" : "▸"} ${GROUP_LABELS[kind]} ${items.length}件`,
        lines: visibleItems.map(({ name, tokens, deferred }) =>
          `${oneLine(name)}  ${formatTokens(tokens)}${deferred ? "（遅延）" : ""}`,
        ),
        range: isExpanded && items.length > CONTEXT_ITEMS_PER_PAGE ? `${offset + 1}–${offset + visibleItems.length} / ${items.length}件` : null,
        hasPrevious: isExpanded && offset > 0,
        hasNext: isExpanded && offset + visibleItems.length < items.length,
      }
    }),
  }
}
