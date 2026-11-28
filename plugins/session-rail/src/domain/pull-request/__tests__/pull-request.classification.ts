import assert from "node:assert/strict"
import test from "node:test"
import { CiStatus, PullRequest } from "../pull-request.ts"

test("チェックなし、全スキップ、取得不可は成功と区別する", () => {
  assert.equal(CiStatus.fromChecks([]), "none")
  assert.equal(CiStatus.fromChecks(["skipped"]), "skipped")
  assert.equal(CiStatus.fromChecks(null), "unavailable")
  assert.equal(CiStatus.fromChecks(["passed", "unknown"]), "unavailable")
  assert.equal(CiStatus.fromChecks(["passed", "skipped"]), "success")
})

test("失敗を実行中で隠さない", () => {
  assert.equal(CiStatus.fromChecks(["passed", "running"]), "running")
  assert.equal(CiStatus.fromChecks(["passed", "running", "failed"]), "failure")
})

test("PR と一致する HTTPS のリンクと非負の差分だけを受け付ける", () => {
  const fields = {
    number: 8, title: "PR title", url: "https://github.example.com/owner/project/pull/8",
    additions: 120, deletions: 0, phase: "open", ci: "none",
  } as const
  assert.deepEqual(PullRequest.fromDetails(fields), fields)
  assert.equal(PullRequest.fromDetails({ ...fields, deletions: -1 }), null)
  assert.equal(PullRequest.fromDetails({ ...fields, url: "https://github.example.com/owner/project/pull/7" }), null)
  assert.equal(PullRequest.fromDetails({ ...fields, url: "file:///owner/project/pull/8" }), null)
  assert.equal(PullRequest.fromDetails({ ...fields, url: "https://name:pass@github.example.com/owner/project/pull/8" }), null)
})
