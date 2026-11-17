# API仕様案

ベースパスは `/api`。フェーズ1からPythonバックエンドにHTTP APIを置き、登録・一覧・詳細・簡単な検索を提供する。FastAPIを採用する場合は生成されるOpenAPIとSwagger UIでリクエスト・レスポンスを確認する。

## ページ検索・表示（フェーズ1）

| メソッド・パス | 入力 | 応答 |
| --- | --- | --- |
| `GET /api/pages` | `q`, `tag`, `folderPath`（任意）、`limit`, `offset` | `200` と `{ "items": Page[], "total": number, "limit": number, "offset": number }` |
| `GET /api/pages/{pageId}` | ページID | `200` と `Page`。存在しなければ `404` |
| `GET /api/pages/{pageId}/preview` | ページID | プレビュー画像。存在しなければ `404` |
| `PUT /api/pages/{pageId}/tags` | `{ "tags": string[] }` | タグを置き換え、`200` と更新後の `Page`。存在しなければ `404` |

`Page` には `id`, `documentId`, `pageNumber`, `heading`, `summary`, `tags[]`, `previewUrl` と、関連資料の情報を入れた `document` を含める。`document.id` は `documentId` と一致する。`document` には `id`, `title`, `authors[]`, `fileName`, `format`, `folderPath[]` を含める。レスポンス例：

```json
{
  "items": [
    {
      "id": "page-001",
      "documentId": "document-001",
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
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

`q` は前後の空白を除き、資料タイトル・著者・ページの見出し・概要に部分一致させる。`tag` はページのタグ名に完全一致、`folderPath` は `論文読み会/2025` のような階層の前方一致とする。複数条件はANDで組み合わせる。条件がなければ全ページを検索対象とし、該当しなければ空の `items` と `total: 0` を返す。大文字・小文字の扱いは実装時に統一する。

`limit` は省略時20、最大100、`offset` は省略時0とする。どちらも整数で、`limit` は1以上、`offset` は0以上。範囲外は `400`。`total` は絞り込み後・ページ分割前の件数とする。結果は `Page.id` の昇順で並べてから `offset` と `limit` を適用する。

登録直後のページの `tags` は空配列とし、ユーザーが `PUT /api/pages/{pageId}/tags` で付ける・修正する。空配列を送るとタグをすべて外す。タグは前後の空白を除いた空でない文字列とし、重複や空文字列を含む場合は `400` とする。

## 資料登録（フェーズ1）

`POST /api/documents` は `multipart/form-data` でPDFまたはPPTXを受け取る。フォーム項目は次のとおり。

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `file` | はい | PDFまたはPPTXのファイル |
| `title` | はい | 資料タイトル |
| `authors` | いいえ | 著者名。複数の場合は同名フィールドを繰り返す |
| `folderPath` | いいえ | 元フォルダ名。上位から順に同名フィールドを繰り返す |

ファイル形式とサイズを検証し、受け付けた場合は `202 Accepted` と `{ "id": "document-001", "status": "pending" }` を返す。取込処理の結果は `GET /api/documents/{documentId}` で `pending` / `ready` / `failed` として確認する。無効な形式は `400`、存在しないIDは `404` とする。ファイルの保存、ページ画像化、DB永続化とともに実装する。

`GET /api/documents/{documentId}` は、取込状態と結果を次の形で返す。`pageCount` は `ready` のときにページ数、それ以外は `null` とする。`error` は `failed` のときに理由を表す文字列、それ以外は `null` とする。

```json
{
  "id": "document-001",
  "status": "ready",
  "pageCount": 12,
  "error": null
}
```

| メソッド・パス | 入力 | 応答 |
| --- | --- | --- |
| `POST /api/documents` | PDF/PPTXと登録情報 | `202` と資料ID・取込状態 |
| `GET /api/documents/{documentId}` | 資料ID | `200` と取込状態・結果。存在しなければ `404` |

削除、Drive連携、意味検索のAPIは、各機能を実装する前に追加する。
