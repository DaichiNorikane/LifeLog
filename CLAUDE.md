# Lifelog - エレナ習慣トレーナーアプリ

## プロジェクト概要
食事記録・ダイエット支援Webアプリ。AIキャラクター「エレナ」が専属トレーナーとしてユーザーを指導する。
エレナのIP育成が最優先目標。ダイエットトレーナー → 習慣トレーナーへの進化を計画中。

**将来計画**: iOSネイティブアプリ化を予定（`docs/ios-migration-plan.md` 参照）

## 技術スタック
- **Framework**: Next.js 16 (App Router) + React 19
- **Deploy**: Vercel
- **DB**: Firebase Firestore (認証・データ永続化)
- **AI**: Gemini API (Google Generative AI) - 食事分析、評価、アドバイス
  - モデル優先順位: `gemini-3.5-flash` → `gemini-2.5-flash` → `gemini-2.5-pro`
- **LINE**: LINE Bot SDK - 通知・対話
- **UI**: lucide-react (アイコン), recharts (グラフ), CSS (designSystem.css)
- **オフラインキャッシュ**: IndexedDB (`idb` ライブラリ) - TTL 5分

## ディレクトリ構成
```
src/
├── app/
│   ├── page.js              # メインダッシュボード（食事一覧、カロリー/PFC/拡張栄養素、モーダル制御）
│   ├── actions.js           # DEPRECATED - 各 actions/ ファイルから直接インポートすること
│   ├── layout.js            # レイアウト
│   ├── globals.css          # グローバルCSS
│   ├── quick/               # クイック記録（URL共有用の簡易入力画面）
│   │   ├── page.js
│   │   └── QuickLogClient.js
│   ├── actions/             # Server Actions（機能別に分割済み）
│   │   ├── gemini-client.js # Gemini API 共通設定・スキーマ定義
│   │   ├── daily-evaluation.js # 日次評価・単品評価
│   │   ├── food-search.js   # AI食事検索
│   │   ├── image-analysis.js # 画像解析
│   │   ├── meal-advisor.js  # 食事アドバイス
│   │   ├── quiz.js          # エレナクイズ生成
│   │   └── recipe.js        # レシピ計算・検索
│   └── api/
│       ├── line/webhook/    # LINE Webhook
│       ├── line/push/       # LINE Push通知
│       ├── widget/calories/ # iOSウィジェット用データAPI
│       ├── push/send/       # Web Push通知送信
│       ├── push/subscribe/  # Web Push購読管理
│       ├── manifest/        # PWAマニフェスト
│       └── cron/            # Vercel Cron Jobs
│           ├── daily-report/     # 日次レポート
│           ├── morning-boost/    # 朝のモチベーション
│           ├── afternoon-check/  # 昼の進捗確認
│           ├── evening-preview/  # 夜のプレビュー
│           ├── reminder/         # 食事記録リマインダー
│           └── weekly-summary/   # 週次サマリー
├── components/
│   ├── FoodLogger.js        # 食事記録（カメラ/検索/手動/レシピ/履歴）
│   │                        # ※recentMealsはpage.jsからpropsで受け取る（Firestoreクエリ不要）
│   ├── EvaluationModal.js   # エレナの日次評価（スコア+表情変化）
│   ├── AdvisorModal.js      # 食事アドバイザー
│   ├── WeightTracker.js     # 体重管理
│   ├── StockManager.js      # 食材メモ
│   ├── DietShooter.js       # ミニゲーム（Canvasゲーム）
│   ├── ElenaChallengeModal.js # クイズ
│   ├── MealRankingModal.js  # ランキング
│   ├── CategoryEvaluationModal.js # カテゴリ評価
│   ├── DietPlanWizard.js    # 目標設定ウィザード
│   └── LineConnector.js     # LINE連携UI
├── services/
│   └── aiService.js         # クライアント側AI（画像リサイズ+分析呼び出し）
├── lib/
│   ├── firebase/            # Firebase設定 (config.js, firestore.js, admin.js)
│   ├── contexts/            # AuthContext
│   ├── line.js              # LINE SDK
│   ├── usePushNotification.js # Web Push購読フック
│   ├── pushHelper.js        # Push通知ヘルパー（サーバー側）
│   └── game/                # SoundManager
├── data/
│   └── elena-character.js   # エレナのキャラクター定義
├── styles/
│   └── designSystem.css     # デザインシステム
└── utils/
    ├── db.js                # IndexedDB キャッシュ（TTL 5分）
    └── mockData.js          # モックデータ
```

**別ディレクトリ**:
- `scripts/lifelog-widget.js` - Scriptable (iOS) ウィジェットスクリプト

## 栄養素データ構造

食事の `macros` オブジェクトには以下が含まれる：

```js
macros: {
  protein: number,    // タンパク質 (g)
  fat: number,        // 脂質 (g)
  carbs: number,      // 炭水化物 (g)
  fiber: number|null, // 食物繊維 (g) - 取得できない場合はnull（0ではない）
  sugar: number|null, // 糖質 (g)    - 取得できない場合はnull
  sodium: number|null,    // ナトリウム (mg) - 取得できない場合はnull
  potassium: number|null, // カリウム (mg)   - 取得できない場合はnull
}
```

**重要**: `fiber/sugar/sodium/potassium` は `null` と `0` を区別して保存する。
`null` = AI が推定できなかった（表示は `―`）、`0` = 実際にゼロ。

## Gemini API の設計

- **定義場所**: `src/app/actions/gemini-client.js`
- **モデルフォールバック**: `MODELS_TO_TRY` 配列の順で試行（失敗時に次のモデルへ）
- **Thinking Budget**: `THINKING.OFF`（最速）/ `THINKING.MEDIUM`（評価）/ `THINKING.DYNAMIC`（画像解析）
- **スキーマ定義**: 全てのAPIレスポンスは JSON Schema で型定義済み
- `actions.js` は廃止済み。`actions/` 配下の各ファイルから直接インポートすること

## エレナのキャラクター設計
- **定義場所**: `src/app/actions/gemini-client.js` の `ELENA_PERSONA` + 各 actions/ の個別プロンプト
- **口調**: 親しみやすい口語体、絵文字多用、アメとムチ
- **表情**: スコアに応じて6段階 (`public/images/elena/`)
- **ステータス**: NORMAL, SCOLD, LOGIC, ENCOURAGE, CHEER
- 機能追加時はエレナのキャラクター性を常に意識すること

## パフォーマンス設計
- **コンポーネント**: 全て `next/dynamic` で動的インポート（初期バンドル最小化）
- **データ取得**: IndexedDB キャッシュ → Firestore の2段階（`utils/db.js`）
- **FoodLogger の履歴**: `page.js` の `meals` データから重複除去して `recentMeals` プロップで渡す（Firestore 追加クエリなし）
- **検索履歴**: IndexedDB TTL 5分 キャッシュ（`searchHistory_${uid}` キー）

## テスト
- **フレームワーク**: Vitest + React Testing Library
- **実行**: `npm test` (全テスト), `npm run test:coverage` (カバレッジ付き)
- **テストファイル**: `tests/` ディレクトリ（unit/, server/, components/）
- **モック**: `tests/mocks/` に共通モック（Gemini, Firebase, LINE SDK等）
- **カバレッジ**: 84%+ statements, 86%+ lines
- **除外**: DietShooter.js（Canvasゲーム）はE2E対象
- **注意**: FoodLogger.test.jsx は重量級のためヒープメモリ不足になることがある（コードの問題ではない）

## 開発ルール
- モバイルファースト（個人利用のWebアプリ）
- Server Actionsでサーバーサイド処理（Gemini API Keyの保護）
- `actions.js` は廃止済み。`src/app/actions/` 配下の各ファイルを使うこと
- 新しい栄養素フィールドを追加する場合は `null` 許容で定義（0と未取得を区別）
- 新機能追加時はテストも追加すること（`npm test` で全テストパスを確認）
- 日本語UI
