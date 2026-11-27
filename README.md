# claude-mods-lab

Claude Code CLI 向けの自作 Mod を試すリポジトリです。

## Session Rail の試作

`/rail` でセッション用ペインを開閉します。今は表示と操作を確かめるための固定データで、Git・PR・コンテキストの実データには接続していません。

Mods に対応した対話型 Claude Code CLI で、リポジトリのルートから試せます。

```sh
claude plugin validate ./plugins/session-rail
claude --plugin-dir ./plugins/session-rail
```

起動後に `/rail` を入力します。広い fullscreen 表示では会話の右、狭い場合や classic 表示では入力欄の上を確認します。もう一度 `/rail` を入力すると閉じます。

ホスト API をスタブにした開閉・描画テストは Node.js 24 で実行できます。

```sh
node --test tests/session-rail.test.ts
```

- [実装計画](docs/session-rail/implementation-plan.md)
- [画面デザイン](docs/session-rail/design.html)（ファイルをブラウザで開く）
