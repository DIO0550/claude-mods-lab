# claude-mods-lab

Claude Code CLI 向けの自作 Mod を試すリポジトリです。

## Session Rail

Mod 名は `session-rail` で、開閉コマンドは `/rail` です。現在の作業フォルダとブランチ、コンテキスト使用量、未コミット差分、現在ブランチの PR と CI を表示します。

開いたときと、ペインが開いている状態で会話のメインターンが終わったときに読み直します。未追跡ファイルは行数に含めず、件数を分けます。

Mods に対応した対話型 Claude Code CLI で、リポジトリのルートから試せます。

```sh
claude plugin validate ./plugins/session-rail
claude --plugin-dir ./plugins/session-rail
```

起動後に `/rail` を入力します。広い fullscreen 表示では会話の右、狭い場合や classic 表示では入力欄の上を確認します。もう一度 `/rail` を入力すると閉じます。

「内訳を表示」を押すと、コンテキストの推計を取得し、使用中・自動圧縮用バッファ・空きを色で分けて表示します。遅延読み込みの項目は使用量に含めません。キーボードでは `Ctrl+X` に続けて `Tab` でペインにフォーカスし、`Tab` と `Enter` で操作できます。内訳を取得できないときは通常の使用量を残し、`/context` を案内します。

PR と CI は、ローカル情報の表示後に現在の worktree から GitHub CLI (`gh`) で取得します。`gh` が使えなくてもローカルの表示は残ります。PR のリンクで GitHub のページを開けます。「ローカル差分を開く」は組み込みの `/diff` を呼び、直接開けない場合は手動実行を案内します。

「サブエージェント」タブでは、今のセッションの名前・タスク・実行状態を確認できます。表示中はサブエージェントのターン開始・完了で読み直し、「一覧を更新」でも再取得できます。行を開くと、種別や取得できた進捗を表示します。タブや行を選んでも会話の入力先は変わりません。

`plugins/session-rail/src/` はドメイン、取得と更新の流れ、外部 API との接続、表示に分かれています。`hooks/register.ts` が各層をつなぎます。各フォルダの役割は実装計画を参照してください。

ターン開始・完了とセッション終了は `SessionEvent`、ペインの配置・終了やタブの切り替えはアプリケーションのイベントとして扱います。未コミット差分の状態は `LocalChanges` で表し、表示側はその状態に応じた文言を選びます。

テストは対象の `.ts` の隣の `__tests__/` に置き、`register.command.ts` のように `対象.カテゴリ.ts` で分けます。`describe` は使わず、トップレベルの `test()` で書きます。テストの規約は [AGENTS.md](AGENTS.md) にあります。

各層の単体テスト、ホスト API をスタブにした開閉・描画テスト、一時リポジトリを使った Git テストは Node.js 24 と Git で実行できます。

```sh
node --test "plugins/**/__tests__/*.ts"
```

- [実装計画](docs/session-rail/implementation-plan.md)
- [画面デザイン](docs/session-rail/design.html)（ファイルをブラウザで開く）
