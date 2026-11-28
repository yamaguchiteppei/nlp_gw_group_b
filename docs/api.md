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

現行の検索条件は `query`・タグ・著者・元フォルダである。資料区分・発表年・スライドの役割による絞り込みはまだ対応していない。追加する項目と値は[データ設計](data-model.md)にまとめる。

Backendは登録したPDF/PPTXをページ画像とテキストに変換し、ページ一覧・検索・詳細・資料内ページ一覧・プレビューから参照できる。画像からの文字認識は行わないため、文字を含まないページの見出しと概要は空文字列になる。

## 検索メタデータのAPI拡張案（Issue #39・未実装）

`PageSummary` と `Page` に `slideRole: string | null`、各応答の `document` に `category: string | null` と `presentationYear: number | null` を追加する。`Page` の `document` には `origin: { "kind": "upload" | "google_drive" }` を追加する。既存資料の区分・発表年・役割は `null`、登録経路は `upload` とし、保存済みJSONに新項目がなくても読み込める既定値を設ける。DriveファイルIDなどの内部情報は通常のページ応答に含めない。

`POST /api/pages/search` の `filters` に `category`、`presentationYear`、`slideRole`、`folderId` を追加する。前の3項目は指定値に完全一致させる。`folderId` はDrive由来の資料が保持するフォルダIDの階層に含まれるかで判定し、既存の `folderPath` は名前による絞り込みとして残す。条件は任意で、指定した条件をANDで組み合わせる。未設定値を絞り込む条件は初期対応に含めない。例：

```json
{
  "query": "モデル構造",
  "filters": {
    "category": "research_presentation",
    "presentationYear": 2026,
    "slideRole": "method"
  },
  "limit": 20,
  "offset": 0
}
```

多数のDrive資料を取り込んだ後もフィルタ候補を得るため、`GET /api/search/facets?field=...&q=...&limit=50&offset=0` を追加する。`field` は `authors`, `tags`, `folders`, `categories`, `presentationYears`, `slideRoles` のいずれか。応答は選択した項目の `items`, `total`, `limit`, `offset` を持ち、候補名の部分一致検索とページ分割に対応する。`limit`・`offset` は既存の一覧APIと同じ範囲とし、`q` の省略時は全候補を対象にする。`null` は候補から除く。候補は検索結果の現在ページには依存させない。

`folders` では各階層を候補として返す。`items` の例は `[{"kind":"google_drive","value":"folder-id","label":"論文読み会 / 2025"},{"kind":"upload","value":"論文読み会/2025","label":"論文読み会 / 2025"}]` とする。Drive由来の選択値は `filters.folderId`、手入力の元フォルダは `filters.folderPath` に使う。同名や `/` を含むDriveフォルダ名はIDで区別する。他の `field` の `items` は文字列または年の数値の配列とする。

`POST /api/documents` の登録フォームには任意の `category` と `presentationYear` を追加する。登録後の訂正には `PATCH /api/documents/{documentId}/metadata`（`title`, `authors`, `category`, `presentationYear` の一部）と `PATCH /api/pages/{pageId}/metadata`（`slideRole`）を設ける。省略した項目は変更せず、`category`・`presentationYear`・`slideRole` の `null` は未設定に戻し、`authors: []` は著者を空にする。資料メタデータの正本は `Document` とし、ページ応答と検索は常に現在の資料情報を参照する。保存済みページ内の資料スナップショットに依存しない。更新は既存のメタデータロック内で読み取り・変更・保存を行い、別項目への同時更新が失われないようにする。出典のDriveファイルIDやフォルダIDはこの更新APIで変更しない。

検索画面では現在の元フォルダ・著者・タグに資料区分・発表年・ページの役割を加える。資料単位表示でも同じページ検索結果を資料IDでまとめるため、`slideRole` は「その役割のページを含む資料」という意味になる。候補はFacet APIから取得し、ページ一覧を全件取得して候補を作る方式を置き換える。

## Drive PDF取り込みのAPI案（Issue #6・未実装）

`POST /api/documents/import/google-drive` はDriveのPDFファイルIDを受け取り、PDF本体をライブラリ側へ保存して既存の取込処理に渡す。資料にはDriveファイルID、更新時刻、取得できたフォルダのID・名前を保存し、`folderPath[]` は表示用に生成する。取り込み対象が共有ライブラリの利用者全員に閲覧可能な資料か、取り込み前に確認する。PDF以外やダウンロード不可のファイルは受け付けず、既存の50 MiB上限をダウンロード中にも適用して、失敗時は途中ファイルを削除する。

DriveファイルIDの確認と資料登録は同じメタデータロック内で行い、同時リクエストでも資料IDを重複発行しない。同じファイルIDで既存資料が `pending` / `ready` ならそのIDと状態を返し、`failed` なら同じIDで取り込みを再試行できるようにする。自動同期・更新されたPDFの再取り込みは別途設計する。

DriveのPDFを登録した場合、`GET /api/documents/{documentId}/source` は取り込んだPDFを返す。Driveの所有者を著者、Driveの更新日時を発表年、フォルダ名を区分や役割として確定しない。フォルダの一部を取得できないときは分かる範囲だけ保持する。Driveからの取得方法とフォルダの扱いは[Google Driveのファイル属性](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)と[ファイルのダウンロード](https://developers.google.com/workspace/drive/api/guides/manage-downloads)を参照する。

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

削除、Drive連携の認証・エラー形式、意味検索、解析情報のAPIは、各機能を実装する前に詳細化する。検索結果や詳細応答にEmbeddingの生ベクトルやPPTXの内部XMLは含めない。
