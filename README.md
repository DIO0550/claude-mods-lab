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

`plugins/session-rail/src/` はドメイン、取得と更新の流れ、外部 API との接続、表示に分かれています。`hooks/register.ts` が各層をつなぎます。各フォルダの役割は実装計画を参照してください。

ターン完了・セッション終了は `SessionEvent`、ペインの配置や終了はアプリケーションのイベントとして扱います。未コミット差分の状態は `LocalChanges` で表し、表示側はその状態に応じた文言を選びます。

テストは対象の `.ts` の隣の `__tests__/` に置き、`register.command.ts` のように `対象.カテゴリ.ts` で分けます。`describe` は使わず、トップレベルの `test()` で書きます。テストの規約は [AGENTS.md](AGENTS.md) にあります。

各層の単体テスト、ホスト API をスタブにした開閉・描画テスト、一時リポジトリを使った Git テストは Node.js 24 と Git で実行できます。

```sh
node --test "plugins/**/__tests__/*.ts"
```

- [実装計画](docs/session-rail/implementation-plan.md)
- [画面デザイン](docs/session-rail/design.html)（ファイルをブラウザで開く）
