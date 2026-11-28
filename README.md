# claude-mods-lab

Claude Code CLI 向けの自作 Mod を試すリポジトリです。

## Session Rail

Mod 名は `session-rail` で、開閉コマンドは `/rail` です。現在の作業フォルダとブランチ、コンテキスト使用量、未コミット差分を表示します。

開いたときと、ペインが開いている状態で会話のターンが終わったときに読み直します。未追跡ファイルは行数に含めず、件数を分けます。PR と CI、コンテキストの内訳は今後の段階です。

Mods に対応した対話型 Claude Code CLI で、リポジトリのルートから試せます。

```sh
claude plugin validate ./plugins/session-rail
claude --plugin-dir ./plugins/session-rail
```

起動後に `/rail` を入力します。広い fullscreen 表示では会話の右、狭い場合や classic 表示では入力欄の上を確認します。もう一度 `/rail` を入力すると閉じます。

ホスト API をスタブにした開閉・描画テストと、一時リポジトリを使った Git テストは Node.js 24 と Git で実行できます。

```sh
node --test tests/*.test.ts
```

- [実装計画](docs/session-rail/implementation-plan.md)
- [画面デザイン](docs/session-rail/design.html)（ファイルをブラウザで開く）
