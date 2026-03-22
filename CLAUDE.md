# Lifelog - エレナ習慣トレーナーアプリ

## プロジェクト概要
食事記録・ダイエット支援Webアプリ。AIキャラクター「エレナ」が専属トレーナーとしてユーザーを指導する。
エレナのIP育成が最優先目標。ダイエットトレーナー → 習慣トレーナーへの進化を計画中。

## 技術スタック
- **Framework**: Next.js 16 (App Router) + React 19
- **Deploy**: Vercel
- **DB**: Firebase Firestore (認証・データ永続化)
- **AI**: Gemini API (Google Generative AI) - 食事分析、評価、アドバイス
- **LINE**: LINE Bot SDK - 通知・対話
- **UI**: lucide-react (アイコン), recharts (グラフ), CSS (designSystem.css)

## ディレクトリ構成
```
src/
├── app/
│   ├── page.js          # メインダッシュボード（食事一覧、カロリー/PFC、モーダル制御）
│   ├── actions.js       # Server Actions（Gemini API連携、エレナのプロンプト定義）
│   ├── layout.js        # レイアウト
│   ├── globals.css      # グローバルCSS
│   └── api/
│       ├── line/webhook/ # LINE Webhook
│       ├── line/push/    # LINE Push通知
│       └── cron/daily-report/ # 日次レポート
├── components/
│   ├── FoodLogger.js     # 食事記録（カメラ/検索/手動/レシピ）
│   ├── EvaluationModal.js # エレナの日次評価（スコア+表情変化）
│   ├── AdvisorModal.js   # 食事アドバイザー
│   ├── WeightTracker.js  # 体重管理
│   ├── StockManager.js   # 食材メモ
│   ├── DietShooter.js    # ミニゲーム
│   ├── ElenaChallengeModal.js # クイズ
│   ├── MealRankingModal.js    # ランキング
│   ├── CategoryEvaluationModal.js # カテゴリ評価
│   └── LineConnector.js  # LINE連携UI
├── services/
│   ├── aiService.js      # クライアント側AI（画像リサイズ+分析呼び出し）
│   └── foodService.js    # 食品データベース検索
├── lib/
│   ├── firebase/         # Firebase設定 (config, firestore, admin)
│   ├── contexts/         # AuthContext
│   ├── line.js           # LINE SDK
│   └── game/             # SoundManager
├── data/
│   └── mext_fct_2020.json # 文科省食品成分表
├── styles/
│   └── designSystem.css  # デザインシステム
└── utils/
    ├── db.js             # IndexedDB (ローカルキャッシュ)
    └── mockData.js       # モックデータ
```

## エレナのキャラクター設計
- **定義場所**: `src/app/actions.js` 内のプロンプト
- **口調**: 親しみやすい口語体、絵文字多用、アメとムチ
- **表情**: スコアに応じて6段階 (`public/images/elena/`)
- **ステータス**: NORMAL, SCOLD, LOGIC, ENCOURAGE, CHEER
- 機能追加時はエレナのキャラクター性を常に意識すること

## 開発ルール
- モバイルファースト（個人利用のWebアプリ）
- Server Actionsでサーバーサイド処理（API Key保護）
- Gemini APIはモデルフォールバック機能あり（flash → pro）
- コンポーネントは動的インポート（パフォーマンス最適化済み）
- 日本語UI
