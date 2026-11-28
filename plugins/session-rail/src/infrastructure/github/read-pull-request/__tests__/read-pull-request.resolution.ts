import assert from "node:assert/strict"
import test from "node:test"
import { readPullRequest, type RunGh } from "../read-pull-request.ts"

const target = { root: "/linked/worktree", branch: "feature/rail" }
const output = (stdout: string) => ({ stdout, stderr: "", exitCode: 0, isStdoutTruncated: false, isStderrTruncated: false })
const current = async () => output(`${target.root}\nrefs/heads/${target.branch}\n`)
const pr = {
  number: 7, title: "Build a rail", url: "https://github.com/owner/project/pull/7", headRefName: target.branch,
  state: "OPEN", isDraft: true, additions: 301, deletions: 4,
}

test("実際の worktree で現在ブランチの PR を引き、CheckRun と StatusContext を読む", async () => {
  const run: RunGh = async (args, cwd) => {
    assert.equal(cwd, target.root)
    assert.deepEqual(args.slice(0, 3), ["pr", "view", "--json"])
    assert.ok(args[3]?.split(",").includes("statusCheckRollup"))
    return output(JSON.stringify({ ...pr, statusCheckRollup: [
      { __typename: "StatusContext", state: "SUCCESS" },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    ] }))
  }
  assert.deepEqual(await readPullRequest(run, current, target), {
    kind: "found",
    request: { number: 7, title: pr.title, url: pr.url, additions: 301, deletions: 4, phase: "draft", ci: "success" },
  })
})

test("キュー、失敗、明示的なチェックなし、未知の応答を区別する", async () => {
  for (const { checks, ci } of [
    { checks: [{ __typename: "CheckRun", status: "QUEUED" }], ci: "running" },
    { checks: [{ __typename: "StatusContext", state: "ERROR" }], ci: "failure" },
    { checks: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "TIMED_OUT" }], ci: "failure" },
    { checks: [], ci: "none" },
    { checks: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "FUTURE" }], ci: "unavailable" },
    { checks: undefined, ci: "unavailable" },
  ]) {
    const result = await readPullRequest(async () => output(JSON.stringify({ ...pr, statusCheckRollup: checks })), current, target)
    assert.equal(result.kind, "found")
    assert.equal(result.request.ci, ci)
  }
})

test("未検出と未認証・通信失敗・壊れた出力を区別する", async () => {
  for (const [response, kind] of [
    [{ ...output(""), exitCode: 1, stderr: 'no pull requests found for branch "owner:feature/rail"\n' }, "none"],
    [{ ...output(""), exitCode: 4, stderr: "gh auth login" }, "unavailable"],
    [{ ...output(""), exitCode: 1, stderr: "failed to contact GitHub" }, "unavailable"],
    [{ ...output(JSON.stringify(pr)), isStdoutTruncated: true }, "unavailable"],
    [output("{broken"), "unavailable"],
  ] as const) {
    assert.deepEqual(await readPullRequest(async () => response, current, target), { kind })
  }
})

test("途中で別のブランチに切り替わったら、同じルートでも PR を捨てる", async () => {
  const moved = async () => output(`${target.root}\nrefs/heads/feature/other\n`)
  const result = await readPullRequest(async () => output(JSON.stringify(pr)), moved, target)
  assert.deepEqual(result, { kind: "stale" })
})

test("手元で名前を変えた PR ブランチは Git の追跡先が一致する場合だけ受け付ける", async () => {
  const remote = async () => output(JSON.stringify({ ...pr, headRefName: "fork-rail" }))
  for (const ref of ["refs/heads/fork-rail", "refs/pull/7/head"]) {
    const git = async (args: readonly string[]) => args[0] === "config" ? output(`${ref}\n`) : current()
    assert.equal((await readPullRequest(remote, git, target)).kind, "found")
  }
  assert.deepEqual(await readPullRequest(remote, current, target), { kind: "stale" })
})
