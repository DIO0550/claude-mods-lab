import type { LocalChanges } from "./local-changes/local-changes.ts"

export type Checkout =
  | { kind: "branch"; name: string }
  | { kind: "detached"; oid: string }

export type WorktreeSummary =
  | { kind: "outside" }
  | { kind: "unavailable" }
  | {
      kind: "ready"
      root: string
      checkout: Checkout
      changes: LocalChanges
    }
