type ChangedFiles = {
  tracked: number
  untracked: number
}

export type DiffTotals = {
  added: number
  deleted: number
  binary: number
}

export type LineDiff =
  | { kind: "unavailable" }
  | { kind: "no-text"; binary: number }
  | ({ kind: "text" } & DiffTotals)

export const LineDiff = {
  fromTotals(totals: DiffTotals | null): LineDiff {
    if (!totals) {
      return { kind: "unavailable" }
    }
    if (totals.added === 0 && totals.deleted === 0) {
      return { kind: "no-text", binary: totals.binary }
    }
    return { kind: "text", ...totals }
  },
}

export type LocalChanges =
  | { kind: "clean" }
  | { kind: "untracked-only"; untracked: number }
  | ({ kind: "tracked-changes"; diff: LineDiff } & ChangedFiles)

export const LocalChanges = {
  fromCounts({ tracked, untracked }: ChangedFiles, totals: DiffTotals | null): LocalChanges {
    if (tracked === 0 && untracked === 0) {
      return { kind: "clean" }
    }
    if (tracked === 0) {
      return { kind: "untracked-only", untracked }
    }
    return { kind: "tracked-changes", tracked, untracked, diff: LineDiff.fromTotals(totals) }
  },
}
