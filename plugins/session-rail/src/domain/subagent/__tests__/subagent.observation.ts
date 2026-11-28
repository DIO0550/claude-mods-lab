import assert from "node:assert/strict"
import test from "node:test"
import { Subagent } from "../subagent.ts"

test("名前とタスクと進捗を分け、ホストの実行状態を保つ", () => {
  assert.deepEqual(Subagent.fromObservation({
    id: "agent-a", name: "レビュー係", type: "Explore", description: "差分の確認", label: "レビュー中", status: "waiting",
  }), {
    id: "agent-a", name: "レビュー係", type: "Explore", task: "差分の確認", progress: "レビュー中", status: "waiting",
  })
})

test("無名なら種別を使い、同じタスク文や未知の状態を重複・誤表示しない", () => {
  const observation = { id: "agent-b", name: " ", type: " Explore ", description: "調査", label: " 調査 ", status: "future" }
  assert.deepEqual(Subagent.fromObservation(observation), {
    id: "agent-b", name: "Explore", type: "Explore", task: "調査", progress: null, status: "unknown",
  })
  assert.equal(Subagent.fromObservation({ ...observation, id: " " }), null)
  assert.equal(Subagent.fromObservation({ ...observation, type: " " })?.name, "agent-b")
})
