export type TurnOrigin =
  | { kind: "main" }
  | { kind: "subagent"; agentId: string }

export const TurnOrigin = {
  fromAgentId(agentId: string | undefined): TurnOrigin {
    if (agentId === undefined) {
      return { kind: "main" }
    }
    return { kind: "subagent", agentId }
  },
}

export type SessionEvent =
  | { kind: "turn-started"; origin: TurnOrigin }
  | { kind: "turn-completed"; origin: TurnOrigin }
  | { kind: "session-ended" }

export const SessionEvent = {
  turnStarted(origin: TurnOrigin): SessionEvent {
    return { kind: "turn-started", origin }
  },
  turnCompleted(origin: TurnOrigin): SessionEvent {
    return { kind: "turn-completed", origin }
  },
  sessionEnded(): SessionEvent {
    return { kind: "session-ended" }
  },
}
