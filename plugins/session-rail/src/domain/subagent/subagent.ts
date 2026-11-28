export type SubagentStatus = "pending" | "running" | "waiting" | "idle" | "completed" | "failed" | "killed" | "unknown"

export type Subagent = {
  id: string
  name: string
  type: string | null
  task: string | null
  progress: string | null
  status: SubagentStatus
}

type Observation = {
  id: string
  name?: string
  type: string
  description: string
  label?: string
  status: string
}

function readStatus(status: string): SubagentStatus {
  switch (status) {
    case "pending":
    case "running":
    case "waiting":
    case "idle":
    case "completed":
    case "failed":
    case "killed":
      return status
    default:
      return "unknown"
  }
}

export const Subagent = {
  fromObservation(observation: Observation): Subagent | null {
    const { id } = observation
    if (!id.trim()) {
      return null
    }
    const type = observation.type.trim() || null
    const task = observation.description.trim() || null
    const progress = observation.label?.trim() || null
    return {
      id,
      name: observation.name?.trim() || type || id,
      type,
      task,
      progress: progress === task ? null : progress,
      status: readStatus(observation.status),
    }
  },
}
