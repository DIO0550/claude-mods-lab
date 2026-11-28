import assert from "node:assert/strict"
import test from "node:test"
import { presentPullRequest } from "../pull-request-view.ts"

test("PR の差分として表示し、改行を含むタイトルは 1 行にする", () => {
  const view = presentPullRequest({
    number: 7, title: "PR\nタイトル", url: "https://github.com/owner/project/pull/7",
    additions: 301, deletions: 0, phase: "draft", ci: "unavailable",
  })
  assert.deepEqual(view, {
    title: "PR�タイトル", url: "https://github.com/owner/project/pull/7",
    link: "PR #7 · ドラフト", detail: "PR 差分 +301 / −0 · CI 取得不可", compact: "PR #7 · +301 / −0 · CI 取得不可",
  })
})
