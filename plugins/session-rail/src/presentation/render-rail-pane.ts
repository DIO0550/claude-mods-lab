import type { Elements } from "claude-code"
import type { RailSummary } from "../domain/session-summary.ts"
import { presentRail } from "./rail-view/rail-view.ts"

export function renderRailPane(
  { Box, Text }: Pick<Elements["terminal"], "Box" | "Text">,
  placement: "dock" | "inline",
  summary: RailSummary | undefined,
) {
  const sections = presentRail(summary)

  if (placement !== "dock") {
    const rows = sections.map(({ label, compact }) =>
      Text({ wrap: "truncate-middle", children: [`${label}  ${compact}`] }),
    )
    return Box({ flexDirection: "column", children: rows })
  }

  const rows = sections.map(({ label, detail }) =>
    Box({
      flexDirection: "column",
      children: [Text({ bold: true, children: [label] }), ...detail.map((line) => Text({ children: [line] }))],
    }),
  )
  return Box({ flexDirection: "column", gap: 1, children: rows })
}
