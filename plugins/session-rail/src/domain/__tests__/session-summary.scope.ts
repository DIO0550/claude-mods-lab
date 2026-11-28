import assert from "node:assert/strict"
import test from "node:test"
import { SessionScope } from "../session-summary.ts"

test("セッション ID と作業先の両方が一致したときに同じ範囲とみなす", () => {
  const scope = { id: "session-a", cwd: "/worktree" }

  assert.equal(SessionScope.equals(scope, { ...scope }), true)
  assert.equal(SessionScope.equals(scope, { ...scope, id: "session-b" }), false)
  assert.equal(SessionScope.equals(scope, { ...scope, cwd: "/other" }), false)
})
