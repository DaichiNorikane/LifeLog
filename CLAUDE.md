# Lifelog - エレナ習慣トレーナーアプリ

## プロジェクト概要
食事記録・ダイエット支援Webアプリ。AIキャラクター「エレナ」が専属トレーナーとしてユーザーを指導する。
エレナのIP育成が最優先目標。ダイエットトレーナー → 習慣トレーナーへの進化を計画中。

**将来計画**:
- iOSネイティブアプリ化を予定（`docs/ios-migration-plan.md` 参照）
- 食事が集中力・睡眠・体調に与える影響の可視化（`docs/condition-impact-design.md` 参照）
- 運動・スクリーンタイム連携と行動ログの可視化（`docs/activity-screentime-design.md` 参照）

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
│       ├── health/sync/     # HealthKitまとめて受信API（ショートカットはこれ1本でよい）
│       ├── health/activity/ # HealthKit日次アクティビティ受信API
│       ├── health/workout/  # HealthKitワークアウト受信API（冪等）
│       ├── health/sleep/    # HealthKit睡眠データ受信API
│       ├── health/weight/   # HealthKit体組成データ受信API
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
│   ├── ActivityCard.js      # ヘルスケア実測値（compact=上段の要約 / 通常=全項目）
│   ├── BodyDetailModal.js   # 「今日のからだ」詳細（実測 + ダイエット目標）
│   ├── DietGoalPanel.js     # ダイエット目標（いつまでに何kg）+ 推移グラフ + エレナ診断
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
│   ├── health/healthMetrics.js # HealthKit指標の定義（唯一の真実）
│   ├── health/ingest.js     # HealthKit受信の共通処理（認証・検証・書き込み）
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

体重記録 `users/{uid}/weights/{YYYY-MM-DD}` には、HealthKit連携で `bodyFat` / `bmi` / `leanBodyMass` / `height` が追加される。いずれも `number|null` で保存し、未取得は `0` ではなく `null` にする。
HealthKitから取得できる体組成はこの5項目で全部（筋肉量・体水分率・内臓脂肪に相当する型がHealthKitに存在しないため、体組成計アプリに表示があっても取得できない）。
体脂肪量(kg)は**保存しない**。導出値を保存すると元の値が変わったときに古いまま残るため、表示時に `calcFatMass()` で毎回計算する。

**体重の手入力は廃止済み**（体組成計 → ヘルスケア → API で自動的に入る）。体重だけ手で上書きすると体脂肪率などの導出値と食い違うため。
`users/{uid}.startWeight` は目標を立てた時点の体重で、進捗率の分母になる。未設定なら進捗バーを出さない（0%固定の嘘表示を避ける）。

## HealthKit連携のデータ構造

| コレクション | 日付キー | 内容 |
|---|---|---|
| `users/{uid}/weights/{YYYY-MM-DD}` | カレンダー日 | 体組成5項目 |
| `users/{uid}/activityLogs/{YYYY-MM-DD}` | カレンダー日 | 歩数・消費カロリー・歩行指標など（定義は `healthMetrics.js`） |
| `users/{uid}/workouts/{workoutId}` | ID=開始時刻+種目（冪等キー） | 個別ワークアウト |
| `users/{uid}/conditionLogs/{YYYY-MM-DD}.sleep.objective` | **論理日 -1**（その睡眠を引き起こした食事の日） | 実測睡眠 |

**注意**: アクティビティ・体重はカレンダー日、睡眠だけ帰属日がずれる（意図的な非対称）。理由は `conditionDate.js` 参照。
新しい指標を足すときは `healthMetrics.js` に1件追加するだけでよい（API検証とUI表示に自動反映される）。
セットアップ手順は `docs/healthkit-activity-setup.md`。

## ダイエット目標

`users/{uid}` に `targetWeight` / `targetDate` / `targetCalories` / `targetBMI` / `height` / `startWeight` / `lastDiagnosis` を持つ。
`targetCalories` は `DietGoalPanel` の目標設定フォームからいつでも変更できる（エレナの診断とは独立）。

**LINE からも操作できる**（`src/lib/line/handlers/goal.js`）:
- 「目標」… 現在の目標を表示
- 「目標カロリー 1800」「目標体重 75」「目標日 12/31」… 変更
- 「目標診断」… エレナが実現可能性を判定し、推奨カロリーを提案

ルーティングは `classifyTextRoute` で体重記録より先に判定する（「目標体重 75」を体重の記録と取り違えないため）。

## 栄養素の1日目標

`src/lib/health/dailyTargets.js` が唯一の真実。厚労省「日本人の食事摂取基準(2020年版)」18〜64歳がベース。

**最重要**: 栄養素によって「良い方向」が逆になる。
- `atLeast`（多いほど良い）… 食物繊維・カリウム・鉄・マグネシウム・オメガ3
- `atMost`（少ないほど良い）… ナトリウム・糖質

同じ見た目のバーで両方を表すと 100% が良いのか悪いのか分からなくなるため、`direction` を型として持ち、色（緑=達成 / 黄=不足 / 赤=超過）で区別する。
値は**性別で変わる**（`userProfile.gender`。未設定なら男性）。糖質だけは公的基準がないため目標カロリーから導出する。

## LINE のリッチメニュー

`scripts/create-richmenu.mjs` で登録する（画像は 2500×1686）。3列×2行:
アルバムから / 何食べる？ / 今日のまとめ ／ からだ / 目標 / 履歴から

「からだ」は `src/lib/line/handlers/body.js`（歩数・睡眠・体組成・目標までの残り）。
「何食べる？」は postback `action=suggest_meal` で、時刻から朝/昼/夕を選んで既存の提案ハンドラを呼ぶ。
「履歴から」は `src/lib/line/handlers/recent-meals.js`。料理名で重複を除いた過去の記録をカルーセルで出し、
`action=log_recent&mid=<食事ID>` で今日の記録として複製する（評価スコアは引き継がない）。
カルーセルは12枚が上限なので、料理11件＋末尾に操作カード（もっと見る/キーワードで探す/すべて表示）を置く。
検索は「履歴 唐揚げ」と送るか、「キーワードで探す」を押して次の発話を待つ（`awaiting_recent_search`）。
Firestore は部分一致検索ができないため、直近300件を読んでメモリ上で絞り込む。

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
