# LINE完結型アップデート実装計画 —「エレナ・トーク」

作成日: 2026-07-09 / ステータス: 計画（未着手）

## 1. 目的とコンセプト

**目的**: 記録・フィードバック・相談を、日常的に開くLINE上の「エレナとのチャット」で完結させる。
アプリを開く→タブを選ぶ→入力する、という摩擦をなくし、「エレナに話しかけるだけ」にすることで記録と習慣化のハードルを下げる。

**コンセプト**: エレナは「アプリの機能」ではなく「LINEの友だち」になる。

- 写真を送れば記録される
- 「カレー食べた」と送れば記録される
- エレナから朝晩に声がかかり、返信するだけで記録が進む
- 悩みを送れば専属トレーナーとして相談に乗る

**Webアプリの位置づけ**: 廃止しない。グラフ・履歴・目標設定など「じっくり見る/設定する」ダッシュボードとして残す。入力の主役をLINEに移す。

## 2. 現状把握（2026-07-09時点）

| 領域 | 現状 |
|---|---|
| Webhook (`src/app/api/line/webhook/route.js`) | 6桁連携コード処理、「朝食/昼食/夕食」キーワードでの提案返信、followイベントのみ。画像・自由テキスト・postback未対応 |
| LINE送信 (`src/lib/line.js`) | push/reply の薄いラッパーのみ。Flex Message・quick reply・loading表示未使用 |
| Cron（6本） | daily-report のみLINE push対応。他はWeb Push中心。全て一方通行の通知 |
| AI基盤 (`src/app/actions/`) | 画像解析・食事検索・評価・アドバイスがスキーマ付きで整備済み。**LINEからそのまま再利用可能** |
| データ | `users/{uid}` に `lineUserId` 保存済み。連携フロー（linkCodes）稼働中 |
| Firestore書き込み | クライアントSDK用ヘルパーのみ（`lib/firebase/firestore.js`）。**サーバー側(Admin SDK)の食事保存ヘルパーがない** |

## 3. アーキテクチャ設計

### 3.1 全体フロー

```
LINEメッセージ受信
  → webhook（署名検証・イベントdedupe）
  → ユーザー解決（lineUserId → uid）
  → ローディング表示開始（LINE公式の「considering...」アニメーション）
  → メッセージルーター
      ├ 画像       → 食事解析フロー
      ├ postback   → 確認/修正/クイズ回答ハンドラ
      ├ テキスト   → ①正規表現ショートカット（体重・コマンド）
      │             ②Geminiインテント分類（記録/相談/質問/雑談）
      └ follow等   → オンボーディング
  → ハンドラ実行（Gemini解析・Firestore保存）
  → reply（Flex Message / quick reply付きテキスト）
```

### 3.2 新規ディレクトリ構成

```
src/lib/line/
├── client.js          # 既存 line.js を移設・拡張（loading表示、richmenu API）
├── router.js          # イベント→ハンドラ振り分け（純関数・テスト容易に）
├── resolveUser.js     # lineUserId → uid 解決（共通化）
├── handlers/
│   ├── meal-photo.js  # 画像→解析→確認カード
│   ├── meal-text.js   # テキスト→栄養推定→確認カード
│   ├── weight.js      # 体重記録
│   ├── summary.js     # 今日のまとめ
│   ├── chat.js        # フリーチャット（エレナ対話）
│   ├── postback.js    # 確認/修正/キャンセル
│   └── link.js        # 既存の連携コード処理を移設
└── flex/
    ├── mealConfirm.js # 食事確認カード
    ├── mealSaved.js   # 記録完了+エレナ評価カード
    ├── dailySummary.js# 今日のまとめカード
    └── evaluation.js  # 日次評価カード（スコア+エレナ表情画像）

src/app/actions/line-intent.js  # インテント分類（gemini-3.5-flash + THINKING.OFF）
src/lib/firebase/adminHelpers.js # Admin SDK版 addMeal/addWeight（cleanData共通化）
```

`webhook/route.js` は署名検証とルーター呼び出しだけの薄い層にする。

### 3.3 会話ステート管理

チャットは「確認→保存」の2ターン制になるため、保留中データを持つ必要がある。

- `users/{uid}/lineState/current`（1ドキュメント）
  - `pendingMeal`: 解析済み・未確定の食事データ
  - `mode`: `null | 'awaiting_meal_type' | 'awaiting_correction' | 'consult'`
  - `updatedAt`: 10分でTTL扱い（期限切れは破棄して通常ルーティング）
- postback の `data` には `action=save_meal&stateId=xxx` 形式で持たせ、二重タップは stateId 消費済みチェックで防ぐ

### 3.4 エレナの会話メモリ（Phase 3）

- `users/{uid}/lineMessages`: 直近の往復ログ（50件、古いものは削除）
- `users/{uid}/profile/elenaMemory`: エレナがユーザーについて記憶しているメモ（好み・弱点・生活パターン）。週次cronでGeminiに要約更新させる
- フリーチャット時のコンテキスト = ELENA_PERSONA + elenaMemory + 今日の記録サマリー + 直近会話10往復

### 3.5 技術的な制約と対策

| 制約 | 対策 |
|---|---|
| replyTokenは短命・1回限り | 受信直後にloading表示API（最大60秒表示）→ 解析完了後にreply。万一期限切れならpushへフォールバック |
| Webhookリトライによる二重処理 | `webhookEventId`（または `message.id`）をメモリ+Firestoreで dedupe |
| LINE無料枠 push 200通/月 | **replyは無料・無制限**なので会話は問題なし。cron通知を統合し1日2通以内に設計（§5 Phase 4） |
| Vercel関数タイムアウト | Fluid Computeのデフォルト300秒で十分。ただしUX上25秒以内を目標 |
| 画像サイズ | LINE Content APIで取得→解析のみに使用。Firestoreには保存しない（現行アプリと同じ） |

## 4. 機能仕様

### F1: 写真で記録（最重要）
1. ユーザーが食事写真を送る（キャプション不要）
2. loading表示 → Content APIで画像取得 → `analyzeImageWithGemini` 再利用
3. **確認Flexカード**を返信: 料理名・カロリー・PFC + 食事タイプ推定（時刻から自動）+ ボタン「✅ 記録する」「✏️ 修正する」「❌ やめる」
4. 「記録する」→ Firestore保存 → エレナの一言評価（単品スコア再利用）を返信
5. 「修正する」→ 「どこを直す？そのまま送って！（例: ご飯半分だった）」→ 補足テキストで再解析（`context` 引数を再利用）

### F2: テキストで記録
- 「昼にカレーライス食べた」→ インテント分類が `log_meal` + 食事内容抽出 → 栄養推定（food-search流用）→ F1と同じ確認カード
- 複数品目（「サラダとゆで卵2個」）も1食としてまとめて推定

### F3: 体重記録
- 「65.2」「体重65.2kg」→ 正規表現で即判定（Gemini不要・最速応答）
- 保存後、前日比・目標までの残りを添えたエレナのコメントを返信

### F4: 「今日どう？」サマリー
- リッチメニューまたはテキストで起動
- 摂取カロリー/目標残り/PFCバー/記録した食事一覧のFlexカード + エレナの現況コメント

### F5: フリーチャット・相談
- どのインテントにも該当しないテキストは全てエレナとの対話へ
- 「今夜飲み会なんだけど何食べればいい？」→ 会話コンテキスト+今日の摂取状況を踏まえて具体的に助言（meal-advisor連携）
- 記録の催促や説教もエレナのキャラクター（アメとムチ）で

### F6: リッチメニュー
- 6分割: 📷 写真で記録 / ✍️ 食べたものを書く / ⚖️ 体重 / 📊 今日のまとめ / 💬 エレナに相談 / 🌐 アプリを開く
- 画像は既存のエレナアセットのトーンで新規作成（Figma or 生成）

### F7: 通知の会話化（習慣化エンジン）
既存cronを「一方通行の通知」から「返信したくなる問いかけ+quick reply」に変える。

| Cron | 現状 | 変更後 |
|---|---|---|
| morning-boost | 応援push | 「おはよ☀️ 今朝は何食べる？」+ quick reply（定番メニュー3つ/写真で送る/まだ） |
| reminder | 未記録リマインド | 前回の記録内容に言及した文脈付き催促（「昨日はサラダ頑張ってたのに、今日はまだ0件…？😢」） |
| daily-report | テキスト評価 | スコア+エレナ表情画像+「明日の作戦を聞く」ボタンのFlexカード |
| weekly-summary | 週間サマリー | 振り返り+「来週の目標どうする？」の対話起点 |

push通数対策として afternoon-check / evening-preview は daily-report 系に統合し、**1日あたり朝1通+夜1通**を基本とする（30日×2=60通 + 週次4通 ≒ 64通/月 で無料枠内に収まる）。

## 5. 実装フェーズ

### Phase 1: チャット記録の中核（MVP）
- [ ] `src/lib/line/` 骨格（client/router/resolveUser/dedupe）+ webhook薄型化
- [ ] loading表示・Content API・postback対応
- [ ] `adminHelpers.js`（Admin SDK版 addMeal、cleanDataの共通化）
- [ ] F1 写真で記録（確認カード→保存→一言評価）
- [ ] F2 テキストで記録 + `line-intent.js`（インテント分類）
- [ ] F3 体重記録
- [ ] ルーター/インテント/Flexテンプレートのユニットテスト

### Phase 2: 完結性を高める
- [ ] F4 今日のまとめカード
- [ ] F6 リッチメニュー（作成・API登録スクリプト）
- [ ] F1修正フロー（補足テキストで再解析）
- [ ] オンボーディング改善（連携直後にチュートリアル会話）

### Phase 3: エレナとの対話
- [ ] F5 フリーチャット（会話履歴 + 今日のデータをコンテキストに）

**F5で参照できるデータ一覧（相談コンテキスト）**:
| データ | ソース | 用途例 |
|---|---|---|
| 今日+直近数日の食事記録（カロリー・PFC・拡張栄養素） | `users/{uid}/meals` | 「今日あと何食べられる？」 |
| 体重推移と目標（目標体重・目標日・推奨カロリー） | `users/{uid}/weights`, user doc | 「ペース大丈夫？」 |
| 食材メモ | `users/{uid}/stockItems` | 「冷蔵庫にあるもので献立考えて」 |
| 直近の日次評価（スコア・指摘） | `users/{uid}/daily_evaluations` | 「昨日何がダメだった？」 |
| 直近の会話履歴（10往復） | `users/{uid}/lineMessages` | 文脈の継続 |
| エレナメモリ（好み・弱点・生活パターン要約） | `users/{uid}/profile/elenaMemory` | 寄り添った応答 |

体調相談は一般的な栄養・生活習慣アドバイスまで。症状の診断に踏み込む話題は、エレナのキャラクターで受診を促すガードをプロンプトに入れる。
- [ ] エレナメモリ（elenaMemory の週次自動更新）
- [ ] 相談モード（meal-advisor連携）

### Phase 4: 習慣化エンジン
- [ ] F7 cron再設計（統合・quick reply化・Flex化）
- [ ] ストリーク祝い・マイルストーンのLINE統一
- [ ] 週次振り返り対話

各Phaseの完了条件: `npm test` 全パス + 実機LINEでの動作確認。

## 6. テスト戦略

- **unit**: router（イベント→ハンドラ振り分け）、体重正規表現、stateのTTL判定、Flexテンプレートのスナップショット
- **server**: 各ハンドラをGemini/LINE SDKモック（`tests/mocks/` 既存流用）で検証。dedupe・stateId二重消費のケースを必ず含める
- **手動E2E**: LINE実機。ngrok等は使わずVercelプレビューデプロイ+Webhook URL切り替えで確認

## 7. リスクと未決事項

- **インテント誤分類**: 記録のつもりが雑談扱いになる等。→ 分類結果をログに残しチューニング。確信度が低い場合は「記録する？それとも相談？」とquick replyで聞き返す
- **LINEアカウントのプラン**: push無料枠200通/月の前提。ユーザーが増える場合はライトプラン移行かWeb Pushとの併用を検討
- **リッチメニュー画像**: デザイン作成が必要（Phase 2で対応方法を決定）
- **iOS移行計画との関係**: 本アップデートはサーバー側資産（actions/Firestore）を厚くするため、`docs/ios-migration-plan.md` とは競合しない。むしろLINEがネイティブアプリ完成までの主要UIになる
