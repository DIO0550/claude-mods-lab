import assert from "node:assert/strict"
import test from "node:test"
import { SessionEvent, TurnOrigin } from "../session-event.ts"

test("エージェント ID がないターンはメインのターンになる", () => {
  assert.deepEqual(SessionEvent.turnCompleted(TurnOrigin.fromAgentId(undefined)), {
    kind: "turn-completed",
    origin: { kind: "main" },
  })
})

test("エージェント ID があるターンはサブエージェントの ID を保持する", () => {
  for (const agentId of ["agent-a", ""]) {
    assert.deepEqual(SessionEvent.turnCompleted(TurnOrigin.fromAgentId(agentId)), {
      kind: "turn-completed",
      origin: { kind: "subagent", agentId },
    })
  }
})

test("セッション終了をターン完了とは別のイベントとして作る", () => {
  assert.deepEqual(SessionEvent.sessionEnded(), { kind: "session-ended" })
})
