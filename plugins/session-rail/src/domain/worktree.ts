export type Checkout =
  | { kind: "branch"; name: string }
  | { kind: "detached"; oid: string }

export type LineChanges = {
  added: number
  deleted: number
  binary: number
}

export type WorktreeSummary =
  | { kind: "outside" }
  | { kind: "unavailable" }
  | {
      kind: "ready"
      root: string
      checkout: Checkout
      tracked: number
      untracked: number
      lines: LineChanges | null
    }
