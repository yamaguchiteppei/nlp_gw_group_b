# API仕様

ベースパスは `/api`。Python/FastAPIで登録・一覧・詳細・簡単な検索を提供する。実装済みのリクエスト・レスポンスは `/api/docs` のOpenAPIとSwagger UIでも確認できる。後半の解析情報などは将来の設計案である。

## ページの一覧・検索・表示（フェーズ1）

APIでいうページは、PDF/PPTXの1ページを表すスライド資産である。Web UIとエージェントは同じAPIを利用する。一覧・検索では候補選択に必要な軽い情報を返し、資料情報を含む詳細は選択したページについて取得する。

| メソッド・パス | 入力 | 応答 |
| --- | --- | --- |
| `GET /api/pages` | `limit`, `offset` | `200` とページ一覧 `PageSummaryList` |
| `POST /api/pages/search` | `query`, `filters`, `limit`, `offset` | `200` と検索結果 `PageSummaryList` |
| `GET /api/pages/{pageId}` | ページID | `200` と `Page`。存在しなければ `404` |
| `GET /api/pages/{pageId}/preview` | ページID | プレビュー画像。存在しなければ `404` |
| `PUT /api/pages/{pageId}/tags` | `{ "tags": string[] }` | タグを置き換え、`200` と更新後の `Page`。存在しなければ `404` |

`PageSummary` には `id`, `documentId`, `pageNumber`, `heading`, `summary`, `tags[]`, `previewUrl` と、候補選択に必要な `document` の `id`, `title`, `authors[]`, `folderPath[]` を含める。`PageSummaryList` は `items`, `total`, `limit`, `offset` を持つ。一覧・検索の共通レスポンス例：

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
        "folderPath": ["論文読み会", "2025"]
      }
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

`POST /api/pages/search` のリクエスト例：

```json
{
  "query": "研究背景",
  "filters": {
    "tag": "背景",
    "author": "サンプル著者",
    "folderPath": "論文読み会/2025"
  },
  "limit": 20,
  "offset": 0
}
```

`query` は空白で区切った各語を資料タイトル・著者・ページの見出し・概要に部分一致させる。各語は順不同で、Unicode NFKC 正規化と大文字小文字を無視して比較する。`filters.tag` はページのタグ名に完全一致、`filters.author` は資料の `authors[]` に含まれる著者名に完全一致、`filters.folderPath` は階層の前方一致とする。各条件は任意で、複数条件はANDで組み合わせる。条件がなければ全ページを検索対象とし、該当しなければ空の `items` と `total: 0` を返す。自由文の意味検索や `slideRole`・`visualType` などの条件は、対応するメタデータと検索処理を追加する段階で拡張する。

`limit` は省略時20、最大100、`offset` は省略時0とする。どちらも整数で、`limit` は1以上、`offset` は0以上。範囲外は `400`。`total` は絞り込み後・ページ分割前の件数とする。一覧・検索とも `Page.id` の昇順で並べてから `offset` と `limit` を適用する。

`GET /api/pages/{pageId}` は `PageSummary` の項目に加え、`document.fileName` と `document.format` を含む `Page` を返す。`document.id` は `documentId` と一致する。解析情報やEmbeddingの生ベクトルは含めない。

登録直後のページの `tags` は空配列とし、ユーザーが `PUT /api/pages/{pageId}/tags` で付ける・修正する。空配列を送るとタグをすべて外す。タグは前後の空白を除いた空でない文字列とし、重複や空文字列を含む場合は `400` とする。

## 資料単位の探索と詳細画面

`Document` は登録したPDF/PPTXの資料全体、`Page` はその中の1ページを表す。`documentId` は資料全体のID、`pageNumber` はその資料内での1始まりのページ番号、`pageId` はページ固有のIDである。

初期段階では新しい資料検索APIを設けず、既存のページAPIを利用する。`GET /api/pages` の結果を `documentId` ごとにまとめれば資料一覧を表示できる。`POST /api/pages/search` の結果を同様にまとめれば、条件に一致するページを含む資料を示せる。どちらも全結果が必要なときは `limit`・`offset` で最後まで取得する。`PageSummaryList.total` はページ件数なので、資料件数は取得後に数える。

資料詳細では、検索に一致したページ以外も含めて同じ資料の全ページをたどれるよう、次のAPIを利用する。

| メソッド・パス | 入力 | 応答 |
| --- | --- | --- |
| `GET /api/documents/{documentId}/pages` | 資料ID、`limit`、`offset` | `200` と `PageSummaryList`。資料が存在しなければ `404` |

`limit`・`offset` は `GET /api/pages` と同じ規則とする。`items` は `pageNumber` 昇順とし、同じ番号がある場合は `id` 昇順で並べる。`total` はその資料に属する全ページ数で、登録済みだがページ生成前の資料には空の `items` と `total: 0` を返す。呼び出し側は必要に応じてページ分割して全ページを取得する。代表画像には取得したページの `previewUrl` を使う。`GET /api/pages/{pageId}` は選択した1ページの詳細、`GET /api/documents/{documentId}` は資料の取込状態の取得に使う。

資料単位の一覧・検索で全ページ取得が重くなった段階では、サーバー側の資料検索・集計APIを検討する。資料内ページ一覧APIは、資料全体を開いたときの移動に使う。

現行の検索条件は `query`・タグ・著者・元フォルダである。資料区分・発表年・スライドの役割による絞り込みはまだ対応していない。資料区分 `category` と発表年 `presentationYear` を利用する際は、登録情報とページ応答に追加し、値が不明な場合を許容する。フォルダ名だけから確定値を推測しない。登録前の自動抽出結果はユーザーが修正できるようにする。

Backendは登録したPDF/PPTXをページ画像とテキストに変換し、ページ一覧・検索・詳細・資料内ページ一覧・プレビューから参照できる。画像からの文字認識は行わないため、文字を含まないページの見出しと概要は空文字列になる。

## 資料登録（フェーズ1）

`POST /api/documents` は `multipart/form-data` でPDFまたはPPTXを受け取る。フォーム項目は次のとおり。

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `file` | はい | PDFまたはPPTXのファイル |
| `title` | はい | 資料タイトル |
| `authors` | いいえ | 著者名。複数の場合は同名フィールドを繰り返す |
| `folderPath` | いいえ | 元フォルダ名。上位から順に同名フィールドを繰り返す |
| `requestId` | いいえ | 登録操作ごとのUUID。同一内容の再送を同じ資料IDとして扱う |

ファイル形式とサイズを検証し、受け付けた場合は `202 Accepted` と `{ "id": "document-001", "status": "pending" }` を返す。取込処理の結果は `GET /api/documents/{documentId}` で `pending` / `ready` / `failed` として確認する。無効な形式は `400`、存在しないIDは `404` とする。ページ数は100以下、プレビューの長辺は1600ピクセル以下、プレビュー画像の合計は150 MiB以下とし、超過時は `failed` にする。中断された `pending` の取込はAPI起動時に再開する。初期実装では元ファイル・プレビューを保存領域に、資料・ページ情報をJSONに永続化する。DBへの移行は後続段階で行う。

`requestId` を指定した再送では、ファイル内容と登録情報が同じなら既存の資料IDを返す。異なる内容に同じIDを使った場合は `409` を返す。

登録できるファイルは50 MiB以下のPDF/PPTXとする。

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
| `GET /api/documents/{documentId}/source` | 資料ID | `200` と登録したPDF/PPTX全体を添付ファイルとして返す。資料や元ファイルがなければ `404` |

## 解析情報と元ファイルの参照

候補の表現・構成をエージェントが理解できるよう、`GET /api/pages/{pageId}/analysis` で `slideRole`, `contentType`, `narrativePattern`, `visualType`, `layoutType`, `description` などを取得できる形を想定する。解析項目には、PPTXから抽出した確定情報か、モデルの推定か、人間が確認・修正した値かを区別できる由来と確認状態を持たせる。これらの項目とレスポンス形式は、解析機能を実装する際に定義する。

元ファイルの参照先はページではなく資料に紐づける。`GET /api/documents/{documentId}/source` は登録時のPDFまたはPPTX全体を元のファイル名で返す。元PPTXが登録されていない資料について、PPTXを返すことは保証しない。ページ1枚を独立したPPTXとして抽出する機能は対象に含めない。

削除、Drive連携、意味検索、解析情報のAPIは、各機能を実装する前に詳細化する。検索結果や詳細応答にEmbeddingの生ベクトルやPPTXの内部XMLは含めない。
