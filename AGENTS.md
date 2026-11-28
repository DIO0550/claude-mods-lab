# Claude Mods Lab

## テスト

- 対象の `.ts` と `__tests__/` は同じディレクトリに置き、モジュール単位でまとめる。
- テストファイル名は `対象.カテゴリ.ts` にする。対象は実装ファイルの拡張子を除いた名前で、カテゴリは検証する責務を表す。たとえば `register.ts` のテストは `__tests__/register.command.ts` と `__tests__/register.render.ts` に分ける。
- `describe` は使用しない。ケースはトップレベルの `test()` で書き、グループ分けはカテゴリごとのファイルで行う。
- 複数のテストファイルで使うヘルパーは `__tests__/support/` に置く。
- リポジトリのルートから `node --test "plugins/**/__tests__/*.ts"` で実行する。
