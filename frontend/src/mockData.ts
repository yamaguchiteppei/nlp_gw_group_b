export type ArtworkKind = 'flow' | 'chart' | 'compare' | 'bullets' | 'matrix' | 'timeline' | 'network' | 'title'

export type Deck = {
  id: string
  title: string
  authors: string[]
  year: number
  category: '研究発表' | '論文読会' | '研究室セミナー'
  folder: string
  sourceFormat: 'PPTX' | 'PDF'
  note: string
}

export type Slide = {
  id: string
  deckId: string
  pageNumber: number
  heading: string
  summary: string
  role: '背景' | '関連研究' | '手法' | '実験' | '結果' | 'まとめ'
  visualType: string
  layoutType: string
  narrativePattern: string
  artwork: ArtworkKind
  tags: string[]
  previewLines?: string[]
}

export const decks: Deck[] = [
  {
    id: 'deck-01',
    title: '日本語長文要約における根拠文選択の検討',
    authors: ['山田 花子', '佐藤 健'],
    year: 2025,
    category: '研究発表',
    folder: '言語処理学会 / 2025',
    sourceFormat: 'PPTX',
    note: '研究背景から提案手法、評価までを扱う発表資料',
  },
  {
    id: 'deck-02',
    title: 'Retrieval-Augmented Generation の評価方法',
    authors: ['田中 美咲'],
    year: 2024,
    category: '論文読会',
    folder: '論文読会 / 2024',
    sourceFormat: 'PDF',
    note: '検索拡張生成の構成と評価指標を整理した読会資料',
  },
  {
    id: 'deck-03',
    title: '対話履歴を用いた質問応答モデルの設計',
    authors: ['佐藤 健'],
    year: 2023,
    category: '研究発表',
    folder: '研究発表 / 2023',
    sourceFormat: 'PPTX',
    note: '対話文脈の扱い方とモデル構造を説明する資料',
  },
  {
    id: 'deck-04',
    title: '研究発表の図解と情報構成を考える',
    authors: ['鈴木 陽菜'],
    year: 2025,
    category: '研究室セミナー',
    folder: '研究室セミナー / 2025',
    sourceFormat: 'PDF',
    note: '比較図や結果図の見せ方を議論したセミナー資料',
  },
]

export const slides: Slide[] = [
  { id: 'slide-01', deckId: 'deck-01', pageNumber: 2, heading: '研究背景：長文要約の難しさ', summary: '入力文書が長くなると、重要な根拠を見失いやすい。', role: '背景', visualType: '概念図', layoutType: '左右分割', narrativePattern: '課題から目的へ', artwork: 'compare', tags: ['長文要約', '課題設定'] },
  { id: 'slide-02', deckId: 'deck-01', pageNumber: 5, heading: '提案手法の全体像', summary: '根拠文の検索と要約生成を二段階でつなぐ。', role: '手法', visualType: '処理フロー', layoutType: '中央図解', narrativePattern: '全体から詳細へ', artwork: 'flow', tags: ['モデル構造', '処理フロー'] },
  { id: 'slide-03', deckId: 'deck-01', pageNumber: 8, heading: '評価結果：根拠文選択の効果', summary: '選択した根拠文を使うことで、要約の一貫性が向上した。', role: '結果', visualType: '棒グラフ', layoutType: 'グラフ中心', narrativePattern: '比較から結論へ', artwork: 'chart', tags: ['評価', '比較'] },
  { id: 'slide-04', deckId: 'deck-01', pageNumber: 10, heading: 'まとめと今後の課題', summary: '手法の有効性と、異なる分野への適用課題を整理する。', role: 'まとめ', visualType: '箇条書き', layoutType: 'テキスト中心', narrativePattern: '成果から課題へ', artwork: 'bullets', tags: ['まとめ'], previewLines: ['根拠文の選択で重要情報を保持', '長文の入力でも一貫した要約を生成', '異なる領域の文書への適用が課題', '説明可能性の評価を今後検討'] },
  { id: 'slide-05', deckId: 'deck-02', pageNumber: 1, heading: 'Retrieval-Augmented Generation', summary: '検索拡張生成の基本的な考え方を紹介する。', role: '背景', visualType: 'タイトル', layoutType: '余白中心', narrativePattern: '主題提示', artwork: 'title', tags: ['RAG', '論文読会'] },
  { id: 'slide-06', deckId: 'deck-02', pageNumber: 4, heading: '検索拡張生成の処理構成', summary: '質問から検索、文脈付与、回答生成までの流れ。', role: '手法', visualType: '処理フロー', layoutType: '横方向フロー', narrativePattern: '段階的説明', artwork: 'flow', tags: ['RAG', '処理フロー'] },
  { id: 'slide-07', deckId: 'deck-02', pageNumber: 7, heading: '評価指標の比較', summary: '回答の正確性と根拠の妥当性を分けて評価する。', role: '実験', visualType: '比較表', layoutType: '表中心', narrativePattern: '観点の比較', artwork: 'matrix', tags: ['評価', '比較'] },
  { id: 'slide-08', deckId: 'deck-03', pageNumber: 3, heading: '対話履歴が必要となる場面', summary: '省略や照応を含む質問では、前の発話が重要になる。', role: '背景', visualType: '会話例', layoutType: 'テキスト中心', narrativePattern: '具体例から課題へ', artwork: 'bullets', tags: ['対話', '課題設定'], previewLines: ['質問1：この論文の目的は何ですか', '回答1：対話文脈の利用を検討します', '質問2：それはどのように評価しますか', '省略された対象を履歴から補う必要がある'] },
  { id: 'slide-09', deckId: 'deck-03', pageNumber: 6, heading: '文脈を統合するモデル構造', summary: '発話列を要約し、質問表現と組み合わせる。', role: '手法', visualType: '構造図', layoutType: '中央図解', narrativePattern: '全体から詳細へ', artwork: 'network', tags: ['モデル構造', '対話'] },
  { id: 'slide-10', deckId: 'deck-03', pageNumber: 9, heading: '履歴長ごとの性能変化', summary: '入力する対話履歴の長さと精度の関係を示す。', role: '結果', visualType: '折れ線グラフ', layoutType: 'グラフ中心', narrativePattern: '変化から考察へ', artwork: 'chart', tags: ['評価', '対話'] },
  { id: 'slide-11', deckId: 'deck-04', pageNumber: 4, heading: '比較図で伝える研究の差分', summary: '既存手法と提案手法の違いを一画面で伝える。', role: '関連研究', visualType: '比較図', layoutType: '左右分割', narrativePattern: '対比から主張へ', artwork: 'compare', tags: ['図解', '比較'] },
  { id: 'slide-12', deckId: 'deck-04', pageNumber: 7, heading: '実験結果の見せ方を組み立てる', summary: '数値の羅列から、結果を読み取れる図へ整理する。', role: '結果', visualType: '段階図', layoutType: '横方向フロー', narrativePattern: '変化の説明', artwork: 'timeline', tags: ['図解', '結果'] },
]

export const deckById = Object.fromEntries(decks.map((deck) => [deck.id, deck])) as Record<string, Deck>
