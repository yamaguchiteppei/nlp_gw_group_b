# API仕様案

ベースパスは `/api`。フェーズ1からPythonバックエンドにHTTP APIを置き、登録・一覧・詳細・簡単な検索を動かす。開発中は同じレスポンス形式のモックデータを使えるようにする。FastAPIを採用する場合は生成されるOpenAPIとSwagger UIでリクエスト・レスポンスを確認する。

## ページ検索・表示（フェーズ1）

| メソッド・パス | 入力 | 応答 |
| --- | --- | --- |
| `GET /api/pages` | `q`, `tag`, `folderPath`（任意のクエリ） | `200` と `{ "items": Page[] }` |
| `GET /api/pages/{pageId}` | ページID | `200` と `Page`。存在しなければ `404` |
| `GET /api/pages/{pageId}/preview` | ページID | プレビュー画像。存在しなければ `404` |

`Page` には `id`, `pageNumber`, `heading`, `summary`, `tags[]`, `previewUrl` と、資料の `id`, `title`, `authors[]`, `fileName`, `format`, `folderPath[]` を含める。レスポンス例：

```json
{
  "items": [
    {
      "id": "page-001",
      "pageNumber": 2,
      "heading": "研究背景",
      "summary": "研究課題を説明するサンプルページ",
      "tags": ["背景"],
      "previewUrl": "/api/pages/page-001/preview",
      "document": {
        "id": "document-001",
        "title": "サンプル発表資料",
        "authors": ["サンプル著者"],
        "fileName": "sample.pdf",
        "format": "pdf",
        "folderPath": ["論文読み会", "2025"]
      }
    }
  ]
}
```

`q` は前後の空白を除き、資料タイトル・著者・ページの見出し・概要に部分一致させる。`tag` はページのタグ名に完全一致、`folderPath` は `論文読み会/2025` のような階層の前方一致とする。複数条件はANDで組み合わせる。条件がなければ全ページ、該当しなければ空の `items` を返す。大文字・小文字の扱いは実装時に統一する。

## 資料登録（フェーズ1）

`POST /api/documents` は `multipart/form-data` でPDFまたはPPTXを受け取る。フォーム項目は次のとおり。

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `file` | はい | PDFまたはPPTXのファイル |
| `title` | はい | 資料タイトル |
| `authors` | いいえ | 著者名。複数の場合は同名フィールドを繰り返す |
| `folderPath` | いいえ | 元フォルダ名。上位から順に同名フィールドを繰り返す |

ファイル形式とサイズを検証し、受け付けた場合は `202 Accepted` と `{ "id": "document-001", "status": "pending" }` を返す。取込処理の結果は `GET /api/documents/{documentId}` で `pending` / `ready` / `failed` として確認する。無効な形式は `400`、存在しないIDは `404` とする。ファイルの保存、ページ画像化、DB永続化とともに実装する。

登録後のタグ編集、削除、Drive連携、意味検索のAPIは、各機能を実装する前に追加する。
