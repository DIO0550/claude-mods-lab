import assert from "node:assert/strict"
import test from "node:test"
import { summarizeLocalChanges } from "../local-changes.ts"

test("変更なしと未追跡だけの変更を区別する", () => {
  assert.deepEqual(summarizeLocalChanges({ tracked: 0, untracked: 0 }, null), { kind: "clean" })
  assert.deepEqual(summarizeLocalChanges({ tracked: 0, untracked: 2 }, null), {
    kind: "untracked-only",
    untracked: 2,
  })
})

test("行数を数えられなくても追跡済みと未追跡の件数を残す", () => {
  assert.deepEqual(summarizeLocalChanges({ tracked: 1, untracked: 2 }, null), {
    kind: "tracked-changes",
    tracked: 1,
    untracked: 2,
    diff: { kind: "unavailable" },
  })
})

test("名前変更やバイナリだけの変更は、集計不能ではなくテキスト行差分なしとする", () => {
  for (const binary of [0, 2]) {
    assert.deepEqual(summarizeLocalChanges({ tracked: 2, untracked: 0 }, { added: 0, deleted: 0, binary }), {
      kind: "tracked-changes",
      tracked: 2,
      untracked: 0,
      diff: { kind: "no-text", binary },
    })
  }
})

test("テキストとバイナリが混在する場合は、行数とバイナリ件数を別々に残す", () => {
  assert.deepEqual(summarizeLocalChanges({ tracked: 2, untracked: 3 }, { added: 0, deleted: 4, binary: 1 }), {
    kind: "tracked-changes",
    tracked: 2,
    untracked: 3,
    diff: { kind: "text", added: 0, deleted: 4, binary: 1 },
  })
})
