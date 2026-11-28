export type TurnOrigin =
  | { kind: "main" }
  | { kind: "subagent"; agentId: string }

export type SessionEvent =
  | { kind: "turn-completed"; origin: TurnOrigin }
  | { kind: "session-ended" }
