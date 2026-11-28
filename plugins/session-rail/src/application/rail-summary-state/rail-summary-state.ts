import { sameScope, type RailSummary } from "../../domain/session-summary.ts"
import { readRailSummary, readScope, type SummarySources } from "../read-rail-summary/read-rail-summary.ts"

export function createRailSummaryState() {
  let summary: RailSummary | undefined
  let revision = 0

  function clear(): number {
    summary = undefined
    return ++revision
  }

  function isCurrent(request: number): boolean {
    return request === revision
  }

  async function refresh(
    sources: SummarySources,
    onChange: () => void,
    canRefresh?: () => Promise<boolean>,
  ): Promise<void> {
    const request = ++revision
    if (canRefresh) {
      const allowed = await canRefresh()
      if (!allowed || !isCurrent(request)) {
        return
      }
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nextSummary = await readRailSummary(sources)
      if (!isCurrent(request)) {
        return
      }
      const activeScope = await readScope(sources)
      if (!isCurrent(request)) {
        return
      }
      if (sameScope(nextSummary.scope, activeScope)) {
        summary = nextSummary
        onChange()
        return
      }

      // 作業先が変わったら前の値を消し、現在の作業先を一度読み直す。
      summary = undefined
      onChange()
    }
  }

  return { clear, isCurrent, refresh, snapshot: () => summary }
}
