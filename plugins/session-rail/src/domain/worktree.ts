import type { LocalChanges } from "./local-changes/local-changes.ts"

export type Checkout =
  | { kind: "branch"; name: string }
  | { kind: "detached"; oid: string }

export const Checkout = {
  branch(name: string): Checkout {
    return { kind: "branch", name }
  },
  detached(oid: string): Checkout {
    return { kind: "detached", oid }
  },
}

export type WorktreeSummary =
  | { kind: "outside" }
  | { kind: "unavailable" }
  | {
      kind: "ready"
      root: string
      checkout: Checkout
      changes: LocalChanges
    }

export const WorktreeSummary = {
  outside(): WorktreeSummary {
    return { kind: "outside" }
  },
  unavailable(): WorktreeSummary {
    return { kind: "unavailable" }
  },
  ready(root: string, checkout: Checkout, changes: LocalChanges): WorktreeSummary {
    return { kind: "ready", root, checkout, changes }
  },
}
