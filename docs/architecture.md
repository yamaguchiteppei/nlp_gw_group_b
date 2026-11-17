# 基本設計

## 構成

フロントエンドはReact/Vite・TypeScript、バックエンドはPython/FastAPIを第一候補とする。フェーズ1からHTTP APIを置き、フロントエンドはAPI経由で一覧・詳細を表示する。

```mermaid
flowchart LR
  UI[React画面] --> API[Slide Library API]
  Agent[Agent・Skill] --> API
  API --> Store[メタデータDB]
  API --> Files[ファイル保存領域]
  Import[PDF/PPTX取込処理] --> Store
  Import --> Files
```

最初は単一のバックエンドとし、検索処理をAPI側に置く。フロントエンドは検索条件を送って結果を表示する。

ローカル開発環境ではDocker Composeでフロントエンドとバックエンドを起動する。エージェントも同じSlide Library APIから検索・詳細情報を取得する。APIは一覧・検索で軽い概要を返し、解析情報や元ファイルは必要なページ・資料について個別に取得する。エージェント専用のバックエンドは設けない。

## フェーズ1の範囲

- PDF/PPTXの登録、保存、ページ画像化とメタデータ管理
- ページ一覧・詳細を返すAPIと、文字列・タグ・元フォルダによる簡単な絞り込み
- 一覧・詳細画面と、検索結果がない場合の表示

Google Drive連携やEmbedding検索は後続段階で扱う。実ファイルを使う前に、登録・閲覧権限と元資料の共有条件を設計する。

## データ処理

PDF/PPTX本体とページのプレビューはファイル用の保存領域、検索対象と元ファイル・ページの対応はDBに置く。取込処理はページ画像と取得可能な文字列を作り、[データ設計](data-model.md)の資料・ページに関連付ける。PDFと元PPTXが対応する場合も、片方だけ登録される場合も扱えるようにする。

Google Drive連携ではフォルダ階層を出典として保持する。フォルダは資料の所属、タグはページの内容・役割として分ける。Embeddingなどの検索用データはページIDに紐づく派生データとして追加する。

APIのリクエスト・レスポンスは[API仕様](api.md)、共同開発の進め方と品質確認は[CONTRIBUTING](CONTRIBUTING.md)を参照する。
