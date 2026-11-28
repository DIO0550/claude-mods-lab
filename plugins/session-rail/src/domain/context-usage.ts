export type ContextMeasurement = {
  tokens?: number
  window: number
  percent?: number
}

export type ContextUsage =
  | { kind: "unmeasured" }
  | { kind: "unavailable" }
  | { kind: "ready"; tokens: number; window: number; percent: number }

export function summarizeContext(measurement: ContextMeasurement | null): ContextUsage {
  if (!measurement) {
    return { kind: "unavailable" }
  }
  const { tokens, window, percent } = measurement
  if (tokens === undefined) {
    return { kind: "unmeasured" }
  }
  if (!Number.isFinite(tokens) || tokens < 0 || !Number.isFinite(window) || window <= 0) {
    return { kind: "unavailable" }
  }
  const ratio = percent !== undefined && Number.isFinite(percent) ? percent : Math.round(tokens / window * 100)
  return { kind: "ready", tokens, window, percent: ratio }
}
