export type CheckResult = "passed" | "failed" | "running" | "skipped" | "unknown"

export type CiStatus = "success" | "failure" | "running" | "none" | "skipped" | "unavailable"

export const CiStatus = {
  fromChecks(checks: readonly CheckResult[] | null): CiStatus {
    if (!checks) {
      return "unavailable"
    }
    if (checks.length === 0) {
      return "none"
    }
    if (checks.includes("failed")) {
      return "failure"
    }
    if (checks.includes("running")) {
      return "running"
    }
    if (checks.includes("unknown")) {
      return "unavailable"
    }
    return checks.includes("passed") ? "success" : "skipped"
  },
}

export type PullRequest = {
  number: number
  title: string
  url: string
  additions: number
  deletions: number
  phase: "open" | "draft" | "merged" | "closed"
  ci: CiStatus
}

export const PullRequest = {
  fromDetails(details: PullRequest): PullRequest | null {
    const { number, title, url, additions, deletions } = details
    if (!Number.isSafeInteger(number) || number <= 0 || !title.trim()) {
      return null
    }
    if (!Number.isSafeInteger(additions) || additions < 0 || !Number.isSafeInteger(deletions) || deletions < 0) {
      return null
    }
    try {
      const link = new URL(url)
      if (link.protocol !== "https:" || link.username || link.password || link.search || link.hash) {
        return null
      }
      if (!link.pathname.endsWith(`/pull/${number}`)) {
        return null
      }
      return { ...details, url: link.href }
    } catch {
      return null
    }
  },
}
