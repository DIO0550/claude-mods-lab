import type { PullRequest } from "../../domain/pull-request/pull-request.ts"
import { oneLine } from "../rail-view/rail-view.ts"

const PHASE = { open: "オープン", draft: "ドラフト", merged: "マージ済み", closed: "クローズ済み" }
const CI_LABEL = {
  success: "成功", failure: "失敗", running: "実行中", none: "チェックなし", skipped: "スキップ", unavailable: "取得不可",
}

export function presentPullRequest(request: PullRequest) {
  const { number, url, additions, deletions, phase, ci } = request
  const id = `PR #${number}`
  const stats = `+${additions} / −${deletions}`
  const checks = `CI ${CI_LABEL[ci]}`
  return {
    url,
    link: `${id} · ${PHASE[phase]}`,
    title: oneLine(request.title),
    detail: `PR 差分 ${stats} · ${checks}`,
    compact: `${id} · ${stats} · ${checks}`,
  }
}
