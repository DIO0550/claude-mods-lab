export type ContextBucket = "used" | "buffer" | "free"

type ContextCategory = {
  kind: ContextBucket | "deferred"
  name: string
  tokens: number
}

export type ContextGroupKind = "mcp-tools" | "memory-files" | "agents"

type ContextItemGroup = {
  kind: ContextGroupKind
  items: readonly { name: string; tokens: number; deferred?: boolean }[]
}

export type ContextEstimate = {
  used: number
  window: number
  categories: readonly ContextCategory[]
  groups: readonly ContextItemGroup[]
}

export type ContextBreakdown = {
  window: number
  buckets: Readonly<Record<ContextBucket, number>>
  categories: readonly ContextCategory[]
  groups: readonly ContextItemGroup[]
}

function isTokenCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 0
}

export const ContextBreakdown = {
  fromEstimate(estimate: ContextEstimate | null): ContextBreakdown | null {
    if (!estimate || !isTokenCount(estimate.used) || !isTokenCount(estimate.window) || estimate.window === 0) {
      return null
    }
    const { categories, window } = estimate
    if (categories.length === 0) {
      return null
    }
    const buckets = { used: estimate.used, buffer: 0, free: 0 }
    for (const { tokens, kind } of categories) {
      if (!isTokenCount(tokens)) {
        return null
      }
      if (kind === "used" || kind === "deferred") {
        continue
      }
      if (kind !== "buffer" && kind !== "free") {
        return null
      }
      buckets[kind] += tokens
    }

    const groups = estimate.groups.map(({ kind, items }) => ({
      kind,
      items: items.filter(({ name, tokens }) => name.length > 0 && isTokenCount(tokens)),
    })).filter(({ items }) => items.length > 0)
    return { window, buckets, categories, groups }
  },
}
