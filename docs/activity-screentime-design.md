# 運動・スクリーンタイム連携 設計書 —「食べたもの」から「1日の過ごし方」へ

作成日: 2026-07-31 / 改訂: 2026-07-31（Phase 1 実装完了）
ステータス: **Phase 1 実装済み / Phase 2 以降は未着手**
対象: iPhone のヘルスケア（運動・アクティビティ）と スクリーンタイム を取り込み、
自分の行動ログを振り返れるようにする

関連ドキュメント:
- `docs/condition-impact-design.md` — コンディション4軸（実装済み）
- `docs/eufy-healthkit-setup.md` — 体組成の HealthKit 連携手順（実装済み）
- `docs/ios-migration-plan.md` — iOS ネイティブ化計画

---

## 1. なぜやるか

Lifelog は今「**何を食べたか**」しか持っていない。
しかし体調・集中力・体重を動かす入力は、食事のほかに **運動** と **画面の使い方（＝生活リズム）** がある。

| 入力 | 現状 | 影響する先 |
|---|---|---|
| 食事 | 記録済み ✅ | カロリー収支・コンディション4軸 |
| 体組成 | HealthKit 経由で受信済み ✅ | 体重推移 |
| 睡眠 | HealthKit 経由で受信済み（**ただし表示面が無い**）⚠️ | コンディション（AI プロンプトのみ） |
| **運動** | **受け口が存在しない** ❌ | 消費カロリー・エネルギー・メンタル |
| **スクリーンタイム** | **受け口が存在しない** ❌ | 睡眠・集中力・夜更かし |

エレナが「習慣トレーナー」に進化するには、**食事以外の習慣**を語れる必要がある。
「昨日の夕食が今日の集中力になる」の次は、
**「昨日 23 時以降のスマホ 90 分が、今日の眠気になっている」**が言えること。

### スコープ外（明示）

- 運動処方・トレーニングメニュー生成（医療・運動指導行為の回避）
- スクリーンタイムの**制限・ブロック**（Lifelog は記録と気づきに徹する）
- 位置情報・連絡先・写真ライブラリなど、上記に不要な個人データ

---

## 2. 現状把握 —「連携済みなのに反映されない」の原因

ユーザー体感「ヘルスケアとは連携できているはずなのにアプリに出てこない」は、
原因が **3 つに分かれている**。混ざっているので切り分ける。

### 2.1 原因A: 運動・スクリーンタイムは、そもそも受け口が無い

現在 API として存在するのは次の 2 本だけ。

| エンドポイント | 保存先 | 状態 |
|---|---|---|
| `POST /api/health/weight` | `users/{uid}/weights/{YYYY-MM-DD}` | 稼働中 |
| `POST /api/health/sleep` | `users/{uid}/conditionLogs/{YYYY-MM-DD}.sleep.objective` | 稼働中 |

歩数・アクティブエネルギー・ワークアウト・スクリーンタイムを送っても**受け取る先が無い**。
ショートカット側で「ヘルスケアと連携できている」ことと、Lifelog がそれを受け取れることは別問題。
→ **§5 の新 API が必要。**

### 2.2 原因B: 睡眠は保存されているが、画面に出す実装が一切ない

`api/health/sleep` は `conditionLogs.{date}.sleep.objective` に書き込んでいる。
しかしこの値を読んでいるのは **`src/app/actions/condition-analysis.js:93` だけ**（エレナのプロンプト用）。

```js
// src/app/actions/condition-analysis.js:93
const asleep = conditionLog.sleep?.objective?.asleepMinutes;
```

`ConditionCard.js` / `ConditionCheckIn.js` / `ConditionModal.js` のどれも `objective` を表示していない。
`ConditionCheckIn` が読むのは `sleep.subjective`（自分でタップした 1〜5）のみ。

**つまりデータは入っているのに、見る場所が存在しない。**
→ **§7.1 が最優先の「反映」作業。**

### 2.3 原因C: 睡眠の日付キーは「前日」に保存される仕様

`getSleepTargetDateKey()` により、睡眠は **その夜を引き起こした食事の日** に紐づく。

```
7/30 8:00 起床 → 保存先は 7/29 のドキュメント
```

これは相関分析のための意図的な設計（`condition-impact-design.md` §3.5）だが、
**「今日の日付で探すと無い」**という体感を生む。Firestore を直接見て「入っていない」と誤判断しやすい。

### 2.4 切り分け手順（実装前にまずこれを実行する）

```bash
# 1) API が生きているか（トークンは Vercel の WIDGET_TOKEN）
curl -i -X POST https://<デプロイURL>/api/health/sleep \
  -H "x-widget-token: $WIDGET_TOKEN" \
  -H "content-type: application/json" \
  -d '{"uid":"<FirebaseのUID>","sleepStart":"2026-07-30T16:00:00Z","sleepEnd":"2026-07-30T23:00:00Z","asleepMinutes":400}'
# → 200 {"success":true,"date":"..."} が返るか / 401 ならトークン不一致
```

| 症状 | 原因 | 対処 |
|---|---|---|
| 401 | `WIDGET_TOKEN` 未設定 or ショートカットのヘッダー名違い | Vercel の環境変数と `x-widget-token` を確認 |
| 400 `Missing uid` | ショートカットの JSON で uid が空文字になっている | ショートカットの「テキスト」変数を確認 |
| 200 だが画面に出ない | **原因B（表示面が無い）** | §7.1 を実装 |
| Firestore に見当たらない | **原因C（前日キー）** | 1 日前のドキュメントを見る |
| 画面が古いまま | IndexedDB キャッシュ TTL 5 分（`src/utils/db.js`） | 5 分待つ or リロード |

**運用上の注意**: ショートカットのオートメーションは「確認後に実行」がオンだと発火しても
通知を押すまで実行されない。「すぐに実行」になっているか確認する（`eufy-healthkit-setup.md` §3 と同じ落とし穴）。

---

## 3. iOS 側で実際に取れるもの・取れないもの

設計の前提として、**取得可能性を先に確定させる**。ここを楽観視すると計画全体が崩れる。

### 3.0 実機のヘルスケアに実際に入っていたもの（2026-07-31 確認）

設計を実データに合わせるため、利用者の iPhone の「すべてのヘルスケアデータ」を確認した。

| 入っていた | 入っていなかった |
|---|---|
| 歩数 / ウォーキング＋ランニングの距離 / 上った階数 | **睡眠**（「睡眠スコア: データなし」） |
| アクティブエネルギー / 安静時消費エネルギー | **エクササイズ時間 / スタンド時間** |
| 心拍数 | 安静時心拍数 / 心拍変動 |
| 歩行速度 / 歩幅 / 歩行非対称性 / 歩行両脚支持時間 / 歩行安定性 | |
| 体重 / 体脂肪率 / BMI / 除脂肪体重 / 身長（eufy 体組成計から） | |

**この確認で計画が変わった点**:

1. **睡眠は当面ゼロ**。`api/health/sleep` は動いているが、送る元のデータが無い。
   睡眠を前提にしたドライバー（§6.2 の `sleep_short_measured` など）は、
   Apple Watch か睡眠アプリを使い始めるまで発火しない。**Phase 4 の優先度を下げる根拠**になる。
2. **エクササイズ時間が無い**ので、「運動したか」の判定は `activeEnergy` と歩数で行う必要がある。
   これは §3.1 で「取れない場合の代替」として想定していた通りで、設計変更は不要。
3. **歩行指標（速度・歩幅など）が豊富に入っている**。Apple Watch が無くても iPhone が勝手に貯めており、
   当初の設計に入っていなかった。日々見るものではないので、カードでは折りたたんで出す。
4. **体組成は5項目で打ち止め**。HealthKit には筋肉量・体水分率・内臓脂肪に相当する型が存在せず、
   EufyLife アプリ側に表示があってもヘルスケア経由では取れない。
   逆に言えば **`weights` に既にある4項目＋身長で、取れるものは全部取れている**。

### 3.1 ヘルスケア（HealthKit）— ショートカットで取れる

「ヘルスケアサンプルを検索」アクションで、期間・並び順・件数を指定して取得できる。

| 項目 | HealthKit 型 | 単位 | 集計方法 |
|---|---|---|---|
| 歩数 | stepCount | 歩 | 今日の合計 |
| アクティブエネルギー | activeEnergyBurned | kcal | 今日の合計 |
| 安静時エネルギー | basalEnergyBurned | kcal | 今日の合計 |
| エクササイズ時間 | appleExerciseTime | 分 | 今日の合計 |
| スタンド時間 | appleStandHour | 時間 | 今日の合計 |
| 歩行＋ランニング距離 | distanceWalkingRunning | km | 今日の合計 |
| 上った階数 | flightsClimbed | 階 | 今日の合計 |
| 安静時心拍数 | restingHeartRate | bpm | 今日の最新 |
| 心拍変動 | heartRateVariabilitySDNN | ms | 今日の最新 |
| 睡眠 | sleepAnalysis | 分 | 実装済み |

**ワークアウト（種目・開始終了時刻つき）**は、ショートカットのバージョンによって
専用アクションの有無が変わる。**実機で 1 度確認してから Phase を確定する**こと。
取れない場合は `activeEnergyBurned` + `appleExerciseTime` の日次合計で代替し、
「運動した/しない」の粒度までは確実に成立させる（§6 のドライバーはこの粒度で設計してある）。

### 3.2 スクリーンタイム — 標準の方法では「取れない」

これが本設計で最も重要な制約。

- **ショートカットにスクリーンタイムを読むアクションは無い。** 使用時間・ピックアップ数を
  直接 JSON で取り出す標準手段は存在しない。
- Apple の Screen Time API（`FamilyControls` / `DeviceActivity` / `ManagedSettings`）は
  **アプリ側からの利用が前提**で、しかも設計上「生の利用時間を外へ出せない」ようになっている。
  - `DeviceActivityReport` は画面に描画する専用の拡張で、**サンドボックス化されていて外部送信ができない**。
  - `DeviceActivityMonitor` 拡張は「**しきい値を超えた**」というイベントのコールバックを受け取れる。
    こちらは処理を書けるので、「SNS が 60 分を超えた」という**事実**は記録できる。
  - `com.apple.developer.family-controls` エンタイトルメントが必要（Apple Developer Program 前提、
    配布には Apple の承認が要る）。**Web アプリの現構成では使えない。**

したがってスクリーンタイムは **3 系統の取得経路を段階的に用意する**。

| 経路 | 取得できるもの | 精度 | 自動化 | 必要なもの | フェーズ |
|---|---|---|---|---|---|
| **A. ショートカットの App オートメーション** | 指定アプリの起動/終了イベント、起動回数、概算の利用時間 | 中（アプリごとに設定が要る） | ◎ 全自動 | ショートカットのみ | Phase 2 |
| **B. スクリーンタイム画面のスクショ → AI 読み取り** | 合計時間・カテゴリ別・ピックアップ数・アプリ別 TOP | ◎ 高（公式の数値そのもの） | △ 週1の手動 | 既存の Gemini 画像解析を流用 | Phase 3 |
| **C. ネイティブ `DeviceActivityMonitor`** | しきい値超過イベント（例: SNS 60 分／就寝後の利用） | 高（イベント単位） | ◎ 全自動 | iOS ネイティブアプリ + エンタイトルメント | Phase 5（`ios-migration-plan.md` と合流） |

**設計判断**: A を「日々の自動ログ」、B を「週次の答え合わせ」として**併用する**。
A だけでは総量がわからず、B だけでは日次の粒度が出ない。両方を `screenTimeLogs` に
`source` と `confidence` 付きで書き、**B が来たら A を上書きする**（公式値を正とする）。

> **B（スクショ読み取り）を推す理由**: この方式は既存資産で今すぐ動く。
> `src/app/actions/image-analysis.js` の Gemini 画像解析パイプラインと、
> `gemini-client.js` の JSON Schema 定義がそのまま使える。新規の外部依存はゼロ。

---

## 4. データモデル（Firestore）

既存ルール（`number | null` を厳守。`null` = 取れなかった、`0` = 実際にゼロ）に従う。

### 4.1 `users/{uid}/activityLogs/{YYYY-MM-DD}` — 日次アクティビティ

```js
{
  date: '2026-07-31',        // カレンダー日（JST）。HealthKit の日次集計に合わせる
  steps: 8421,               // number | null
  activeEnergy: 412,         // kcal, number | null
  basalEnergy: 1520,         // kcal, number | null
  exerciseMinutes: 38,       // number | null
  standHours: 10,            // number | null
  distanceKm: 6.2,           // number | null
  flightsClimbed: 12,        // number | null
  restingHeartRate: 58,      // bpm, number | null
  hrv: 42,                   // ms (SDNN), number | null
  source: 'healthkit',
  capturedAt: '2026-07-31T13:05:00.000Z',
  updatedAt: <serverTimestamp>,
}
```

### 4.2 `users/{uid}/workouts/{workoutId}` — 個別ワークアウト

```js
{
  type: 'running',           // HealthKit の workoutActivityType 文字列
  typeLabel: 'ランニング',     // 日本語表示名（マッピングは lib/health/workoutTypes.js）
  start: '2026-07-31T09:12:00.000Z',
  end:   '2026-07-31T09:47:00.000Z',
  durationMinutes: 35,
  activeEnergy: 310,         // number | null
  distanceKm: 5.1,           // number | null
  avgHeartRate: 142,         // number | null
  date: '2026-07-31',        // カレンダー日（一覧・集計用）
  logicalDate: '2026-07-31', // 論理日（コンディション用。4:00 区切り）
  source: 'healthkit',
  updatedAt: <serverTimestamp>,
}
```

**ドキュメント ID = 冪等キー**。HealthKit の UUID があればそれを使う。
無ければ `${startISO}_${type}` を正規化した文字列（`:` を除去）を使う。
これにより**同じショートカットを 1 日に何度実行しても重複しない**。

### 4.3 `users/{uid}/screenTimeLogs/{YYYY-MM-DD}` — 日次スクリーンタイム

```js
{
  date: '2026-07-31',
  totalMinutes: 312,         // number | null
  pickups: 74,               // number | null
  notifications: 190,        // number | null
  firstPickupAt: '2026-07-31T22:40:00.000Z', // ISO | null（＝起床直後のスマホ）
  lastUseAt:     '2026-07-31T16:10:00.000Z', // ISO | null（＝就寝前の最終使用）
  nightMinutes: 88,          // 就寝予定2時間前以降の利用分。number | null
  categories: {              // 全て number | null
    sns: 96, entertainment: 74, productivity: 51,
    games: 0, reading: 22, creativity: null, other: 69,
  },
  apps: [                    // 上位 10 件まで。無ければ []
    { name: 'X', minutes: 62, category: 'sns' },
  ],
  source: 'screenshot',      // 'automation' | 'screenshot' | 'manual' | 'deviceactivity'
  confidence: 'high',        // 'high'（公式値） | 'medium' | 'low'（イベント推定）
  capturedAt: '2026-08-01T02:00:00.000Z',
  updatedAt: <serverTimestamp>,
}
```

### 4.4 `users/{uid}/appEvents/{autoId}` — App 起動/終了の生ログ（経路A）

```js
{
  appName: 'X',
  category: 'sns',           // クライアント側の対応表で解決。未知なら 'other'
  action: 'open',            // 'open' | 'close'
  at: '2026-07-31T14:03:00.000Z',
  date: '2026-07-31',
  logicalDate: '2026-07-31',
}
```

- 生ログは件数が増えるため、**30 日を超えたものは cron で削除**する（§9）。
- 日次の集計値は `screenTimeLogs` 側へ書き戻す（`source: 'automation'`, `confidence: 'low'`）。
- `open` と `close` のペアが取れた区間だけを利用時間として数える。ペアが崩れた区間は
  **推定しない**（`null` のまま）。ここで無理に補完すると数字の信頼が崩れる。

### 4.5 セキュリティルール

`firestore.rules` は既に `users/{userId}/{document=**}` を本人のみ read/write に制限しているため、
**新しいサブコレクションの追加でルール変更は不要**。
書き込みは Admin SDK（API 経由）と本人のクライアントのみ。

---

## 5. API 設計

### 5.1 方針: バッチ受信エンドポイントを主役にする

`weight` / `sleep` と同じ流儀で `activity` / `workout` / `screentime` を個別に足すと、
**ユーザーが作るショートカットとオートメーションが 5 個になる**。設定コストが現実的でない。

そこで **1 本のバッチ API** を主経路にする。

```
POST /api/health/sync
```

```jsonc
{
  "uid": "<FirebaseのUID>",
  "capturedAt": "2026-07-31T13:00:00Z",   // 省略可（省略時はサーバー時刻）
  "weight":   { "weight": 68.2, "bodyFat": 18.4, "bmi": 22.1, "leanBodyMass": 55.6 },
  "sleep":    { "sleepStart": "...", "sleepEnd": "...", "asleepMinutes": 402 },
  "activity": { "steps": 8421, "activeEnergy": 412, "exerciseMinutes": 38 },
  "workouts": [ { "type": "running", "start": "...", "end": "...", "activeEnergy": 310 } ],
  "screenTime": { "totalMinutes": 312, "pickups": 74, "categories": { "sns": 96 } }
}
```

- **どのキーも省略可能**。存在するものだけを処理する。
- レスポンスは**ドメインごとの成否**を返す。1 つ失敗しても他は書き込む（部分成功）。

```jsonc
{
  "success": true,
  "results": {
    "weight":     { "ok": true,  "date": "2026-07-31" },
    "activity":   { "ok": true,  "date": "2026-07-31" },
    "workouts":   { "ok": true,  "written": 1, "skipped": 0 },
    "screenTime": { "ok": false, "error": "Invalid totalMinutes" }
  }
}
```

**部分成功を採用する理由**: ショートカットは「体脂肪が取れない日」「ワークアウトが無い日」が普通にある。
全体を 400 で落とすと、取れているデータまで捨てることになる。

### 5.2 個別エンドポイント（互換 & 段階導入用）

| メソッド | パス | 用途 |
|---|---|---|
| POST | `/api/health/weight` | **既存・維持**（`eufy-healthkit-setup.md` の手順が生きているため） |
| POST | `/api/health/sleep` | **既存・維持** |
| POST | `/api/health/activity` | 日次アクティビティ |
| POST | `/api/health/workout` | ワークアウト（単体 or 配列） |
| POST | `/api/health/screentime` | スクリーンタイム日次 |
| POST | `/api/health/app-event` | App 起動/終了（経路A、1 件ずつ） |
| POST | `/api/health/sync` | 上記すべてのバッチ |

### 5.3 共通化: `src/lib/health/ingest.js`

認証・数値バリデーション・日付キー解決が 7 本に重複するのを防ぐため、共通ライブラリに切り出す。

```js
// src/lib/health/ingest.js
export const verifyWidgetToken = (request) => { /* x-widget-token を検証 */ };
export const toFiniteNumber = (value) => { /* 既存 weight/sleep から移設 */ };
export const toBoundedNumber = (value, { min, max }) => { /* 範囲外は null */ };
export const parseIsoDate = (value) => { /* 不正なら null */ };

// ドメインごとの writer。sync も個別ルートも同じ関数を呼ぶ
export const writeActivity   = async (uid, payload, capturedAt) => { /* ... */ };
export const writeWorkouts   = async (uid, list) => { /* ... */ };
export const writeScreenTime = async (uid, payload, capturedAt) => { /* ... */ };
```

既存の `weight` / `sleep` ルートも `toFiniteNumber` などをここから import する形にリファクタする
（**振る舞いは変えない**。テストが既にある領域なので、移設のみ）。

### 5.4 バリデーション方針（異常値対策）

HealthKit は複数ソース（iPhone / Watch / サードパーティアプリ）が混ざり、
たまに桁違いの値が来る。**範囲外は 400 で弾かず `null` にする**（`sleep` の `toBoundedMinutes` と同じ流儀）。

| フィールド | 許容範囲 | 範囲外の扱い |
|---|---|---|
| steps | 0〜200,000 | null |
| activeEnergy | 0〜10,000 kcal | null |
| exerciseMinutes | 0〜1,440 | null |
| restingHeartRate | 25〜200 | null |
| hrv | 1〜500 | null |
| workout.durationMinutes | 1〜1,440 | そのワークアウトを skip |
| screenTime.totalMinutes | 0〜1,440 | null |
| screenTime.pickups | 0〜1,000 | null |

`uid` 欠落と認証失敗だけが 4xx。それ以外は「取れなかった」として受け入れる。

### 5.5 認証について（現状の追認と将来）

現在は `x-widget-token`（全ユーザー共通の `WIDGET_TOKEN`）+ ボディの `uid`。
個人利用の前提では十分だが、**トークンが漏れると任意 uid に書き込める**。

- 今回は既存方式を踏襲する（新方式を混ぜると設定手順が二重になり、実運用が止まるため）。
- 将来 iOS ネイティブ化（`ios-migration-plan.md`）の際に **Firebase ID トークン検証**へ移行する。
  そのため `ingest.js` の `verifyWidgetToken` は**呼び出し側から差し替え可能な形**にしておく。

---

## 6. コンディションエンジンへの統合

### 6.1 前提: 食事ドライバーと行動ドライバーを分離する

現エンジン（`conditionEngine.js` / `conditionRules.js`）は **食事のみ**を入力とし、
`confidence` は「栄養素がどれだけ記録されているか」(`AXIS_NUTRIENTS`) で決まる。
ここに運動・スクリーンタイムを素朴に混ぜると、**食事の記録率が低い日でも
行動データだけでスコアが出てしまい**、confidence の意味が壊れる。

**設計判断**:
- 行動ドライバーは `BEHAVIOR_DRIVER_WEIGHTS` として**別テーブル**に定義する。
- `confidence` の計算対象には**含めない**（従来どおり栄養素の記録率で決まる）。
- ただし `insufficient`（＝スコア非表示）の日でも、行動ドライバーは
  **「今日の記録」カードに事実として表示する**（スコア化はしない）。
- `ENGINE_VERSION` を **1 → 2** に上げる。過去のスナップショット（`predicted` / `firedDrivers`）は
  version 1 のまま残り、Phase 4 の相関分析は version ごとに分けて扱う。

### 6.2 追加ドライバー案

```js
// src/lib/health/conditionRules.js（追加）
export const BEHAVIOR_DRIVER_WEIGHTS = {
  focus: {
    exercise_yesterday:   6,   // 前日にエクササイズ20分以上
    sleep_short_measured: -12, // 実測睡眠が6時間未満
    sleep_ample_measured:  8,  // 実測睡眠が7時間以上
    screen_night_heavy:   -8,  // 就寝2時間前以降のスマホが60分以上
  },
  sleep: {
    screen_night_heavy:  -12,
    exercise_today:        6,  // 日中の運動は寝つきにプラス
    exercise_late:        -6,  // 就寝3時間前以降の高強度運動
    steps_very_low:       -5,  // 3,000歩未満
  },
  energy: {
    steps_low:            -8,  // 5,000歩未満
    steps_high:            6,  // 10,000歩以上
    sleep_short_measured: -10,
    exercise_overreach:   -6,  // 直近3日連続で高強度 + 安静時心拍が上振れ
  },
  mood: {
    exercise_today:        8,  // 運動の気分改善効果は最も再現性が高い
    steps_high:            5,
    screen_sns_excess:    -8,  // SNS が 120 分以上
    screen_night_heavy:   -5,
  },
};

export const BEHAVIOR_THRESHOLDS = {
  exerciseMinutes: 20,
  exerciseLateHours: 3,        // 就寝までこの時間を切っての運動は late
  stepsVeryLow: 3000,
  stepsLow: 5000,
  stepsHigh: 10000,
  sleepShortMinutes: 360,      // 6h
  sleepAmpleMinutes: 420,      // 7h
  screenNightMinutes: 60,
  screenNightBeforeBedHours: 2,
  screenSnsMinutes: 120,
  restingHrElevatedBpm: 5,     // 直近14日平均からの上振れ幅
};
```

**採用しなかったもの**:
- 「総スクリーンタイムが長い＝悪」は入れない。仕事で使う日と娯楽の日を区別できず、
  **エレナが理不尽に責める**ことになる。責めるのは**夜間利用**と**SNS 突出**に限定する。
- 消費カロリーからの「もっと動け」型ドライバーは入れない（`condition-impact-design.md` §12 の
  表現ガードと同じ理由で、達成できない要求を毎日突きつける形になるため）。

### 6.3 エレナの語り口への反映

`condition-analysis.js` のプロンプトに **行動セクション**を追加する。

```
【今日の行動】
- 歩数: 8,421歩 / 運動: ランニング 35分（310kcal）
- 実測睡眠: 6時間42分（就寝 1:10 / 起床 7:52）
- 夜のスマホ: 就寝2時間前以降に 88分（うち SNS 62分）
```

語り口の原則（既存のキャラクター設計を踏襲）:
- 数字を読み上げるだけにしない。**必ず「だから今日はこう」に接続する**。
- スクリーンタイムは**最も責めやすい領域**なので、ガードを強くする。
  - ✅「昨日の夜、23時以降に SNS を 1時間半。今日の眠気はここが効いていそうです😢」
  - ❌「スマホの使いすぎです」「依存です」
- 運動した日は**必ず拾って褒める**。運動は自己申告でなく実測なので、
  エレナが気づいてくれる体験の価値が高い。

### 6.4 消費カロリーの扱い（二重計上の回避）

**重要な落とし穴**: `DietPlanWizard.js:45` の `targetCalories` は
`BMR × 活動レベル係数`（moderate なら 1.55）＝ **TDEE ベース**で算出されている。
つまり**日常の活動分は既に目標値に織り込まれている**。
ここに HealthKit の `activeEnergy` をそのまま足すと**二重計上**になり、
「食べていいカロリー」が実態より大きく出る。

そこで設定 `activityCalorieMode` を `users/{uid}` に持たせる。

| モード | 挙動 | 既定 |
|---|---|---|
| `off` | 消費カロリーを表示しない | |
| `display` | 表示のみ。目標カロリーは動かさない | **✅ 既定** |
| `adjust` | 「普段より多く動いた分」＝ `activeEnergy − 直近14日の中央値` の**正の差分のみ**を目標に加算（上限 +500kcal/日） | |

`adjust` を選んだ場合も、UI に必ず内訳を出す（「目標 2,000 + 運動分 180 = 2,180 kcal」）。
**黙って目標値が動くのが一番まずい。**

---

## 7. UI 設計

### 7.1 【最優先】睡眠・アクティビティの表示面をつくる

§2.2 の「入っているのに見えない」を解消する。ダッシュボードにカードを 1 枚追加する。

**`src/components/ActivityCard.js`（新規）**

```
┌─────────────────────────────────────┐
│ 📊 今日のからだ                  詳しく > │
├─────────────────────────────────────┤
│  👟 8,421歩     🔥 412kcal    ⏱ 38分  │
│  😴 6時間42分（1:10 → 7:52）           │
│  📱 夜のスマホ 88分                     │
├─────────────────────────────────────┤
│  🏃 ランニング 35分・5.1km・310kcal      │
└─────────────────────────────────────┘
```

- データが 1 つも無ければ**カードごと非表示**（`ConditionCard` の `hasAnyScore` と同じ流儀）。
- 未取得の項目は `―` を出す（`0` と区別する。既存の拡張栄養素カードと同じ）。
- 睡眠は §2.3 の日付ルールに従い、**表示時に「昨夜の睡眠」とラベルする**。
  内部キーが前日であることをユーザーに意識させない。

配置は `page.js` の `ConditionCard` の**直下**。
コンディション（予測）→ アクティビティ（実測）の順で、予測と実測が並ぶ形にする。

### 7.2 ライフログ・タイムライン（＝「行動ログを参照できるように」の本体）

**`src/components/LifeTimeline.js`（新規）** — 1 日を時系列で 1 本にまとめる。

```
2026-07-31 (木)
─────────────────────────
 07:52  ☀️ 起床（睡眠 6時間42分・深い睡眠 82分）
 08:10  📱 X を 12分
 08:30  🍳 朝食 目玉焼きとトースト  480kcal
 09:12  🏃 ランニング 35分 5.1km  −310kcal
 12:40  🍚 昼食 唐揚げ弁当  820kcal
 15:00  ☕️ アイスコーヒー  カフェイン 120mg
 19:30  🍖 夕食 焼き魚定食  650kcal
 22:00  📱 夜のスマホ開始（SNS 中心）
 23:28  📱 → 62分
 01:10  🌙 就寝
─────────────────────────
 合計 1,950kcal / 消費 412kcal / 8,421歩
```

**設計上のポイント**:
- **データ源をまたいだ統合ビューにする**。食事(`meals`)・ワークアウト(`workouts`)・
  睡眠(`conditionLogs.sleep.objective`)・アプリ利用(`appEvents`)・体重(`weights`)・
  体感入力(`conditionLogs.*.subjective`) を 1 本の配列にマージして時刻でソートする。
- マージは**クライアント側**で行う（各コレクションは既に取得済み or 追加 1 クエリで済む）。
- **論理日（4:00 区切り）で切る**。深夜 1 時の夜食と就寝がその日の末尾に来る形が正しい。
  カレンダー日で切ると就寝が翌日の先頭に飛び、1 日が読めなくなる。
- 日付を左右にスワイプ／矢印で移動。既存の `page.js` の日付切り替え UI を流用する。
- 表示は**全て動的インポート**（`next/dynamic`）。既存のパフォーマンス設計に従う。

**導線**: ダッシュボードの `ActivityCard` の「詳しく >」から開く。
`ConditionModal` と同様のフルスクリーンモーダルとする（新規ルートを増やさない）。

### 7.3 スクリーンタイム週次レポートの取り込み UI

**`src/components/ScreenTimeImport.js`（新規）** — 経路B（スクショ OCR）の入口。

1. 「設定 → スクリーンタイム → すべてのアクティビティを確認する」のスクショを選ぶ
2. `src/services/aiService.js` の画像リサイズを通す（既存フローの再利用）
3. 新 Server Action `src/app/actions/screentime-analysis.js` で Gemini に投げる
4. 抽出結果を**確認画面で見せてから**保存する（AI の読み取りミスをそのまま保存しない）

```js
// src/app/actions/screentime-analysis.js のレスポンススキーマ（gemini-client.js の流儀に従う）
{
  days: [{
    date: 'YYYY-MM-DD',
    totalMinutes: number | null,
    pickups: number | null,
    notifications: number | null,
    categories: { sns, entertainment, productivity, games, reading, creativity, other },
    apps: [{ name: string, minutes: number }],
  }]
}
```

- Thinking Budget は `THINKING.OFF`（画面の数字を読むだけの仕事に思考予算は不要）。
- **週次スクショ 1 枚から 7 日分**を一度に取り込めるようにする。手動作業を週 1 回に閉じ込める。

---

## 8. iOS ショートカット設計（ユーザー側の作業）

設定の手間が導入の最大の障壁なので、**ショートカットは 2 個・オートメーションは 2 個に抑える**。

### 8.1 ショートカット①「Lifelog 同期」（1 日 1 回・自動）

```
1. ヘルスケアサンプルを検索: 歩数 / 今日 / 合計
2. ヘルスケアサンプルを検索: アクティブエネルギー / 今日 / 合計
3. ヘルスケアサンプルを検索: エクササイズ時間 / 今日 / 合計
4. ヘルスケアサンプルを検索: 体重・体脂肪率・BMI・除脂肪体重 / 今日 / 最新1件
5. ヘルスケアサンプルを検索: 睡眠 / 昨夜 / 合計
6. 辞書を作成 → 上記をセット
7. URL の内容を取得
     URL: https://<デプロイURL>/api/health/sync
     方法: POST
     ヘッダー: x-widget-token: <WIDGET_TOKEN>
     本文: JSON（手順6の辞書）
```

→ オートメーション「毎日 12:00」で自動実行（**「すぐに実行」をオンにする**）。

**なぜ 12 時か**: 睡眠は前夜分が確定済み、体重は朝の計測が入っている、
歩数は午後にもう一度走らせれば上書きされる（同一キーへの merge 保存なので安全）。
より正確にしたい場合は 12 時と 23 時の 2 回に増やせばよい。

### 8.2 ショートカット②「スマホ使用ログ」（App オートメーション・経路A）

対象アプリ（SNS・動画など、本人が気にしているもの 3〜5 個）に対して:

```
「<App> を開いたとき」 → /api/health/app-event に {action:"open", appName:"X"} を POST
「<App> を閉じたとき」 → /api/health/app-event に {action:"close", appName:"X"} を POST
```

- **全アプリを対象にしない**。気にしているものだけに絞る。
  全部やると設定が終わらないうえ、通知やバッテリーの負担も増える。
- 精度は割り切る。**「夜にどれだけ触ったか」がわかれば設計目的は達成できる**（§6.2 参照）。

### 8.3 手順書

`docs/eufy-healthkit-setup.md` と同じ粒度で
**`docs/healthkit-activity-setup.md`** を新規作成する（スクショ前提の逐次手順）。
既存手順書は成功実績があるので、書式を完全に踏襲する。

---

## 9. cron / 通知への反映

| cron | 追加する内容 |
|---|---|
| `morning-boost` (7:30) | 昨夜の実測睡眠に言及。「6時間半でしたね。今日は昼にタンパク質を足しましょう」 |
| `evening-preview` (17:30) | 歩数が少ない日に一言。「今日はまだ 3,200歩。夕食前に少し歩けると夜がラクですよ🌙」 |
| `daily-report` (22:00) | 運動・歩数・夜のスマホを日次サマリーに含める |
| `weekly-summary` (日 8:00) | 週次の運動日数・平均歩数・スクリーンタイム推移。**スクショ取り込みのリマインドもここで出す** |
| **`cleanup-app-events`（新規・日次）** | `appEvents` の 30 日超を削除し、日次集計を `screenTimeLogs` へ書き戻す |

`vercel.json` の cron は UTC 表記である点に注意（既存も `30 22 * * *` = JST 7:30）。
新規 cron 追加時は `tests/unit/vercel-crons.test.js` の期待値も更新する。

---

## 10. プライバシー

スクリーンタイムは**食事より機微な情報**である（何を見ていたかが行動を露呈する）。

- **アプリ名は保存するが、URL・コンテンツ・通知の中身は一切扱わない。**
- Gemini に送るのは**集計値のみ**。スクショ画像そのものは
  解析後に保持しない（既存の画像解析と同じく、Firestore に画像を保存しない方針を踏襲）。
- アプリ別の内訳は**カテゴリに丸めた値**をエレナに渡す。個別アプリ名をプロンプトに載せるかは
  設定 `shareAppNamesWithAI`（既定 `false`）で制御する。
- ユーザーが `screenTimeLogs` / `appEvents` を**まとめて削除できる導線**を設定画面に置く。

---

## 11. 実装フェーズ

| Phase | 内容 | 成果 | 目安 |
|---|---|---|---|
| **1** ✅ | `ingest.js` 共通化 + `/api/health/activity` `/workout` `/sync` + `ActivityCard`（睡眠表示を含む） | **「連携したのに見えない」が解消される**。歩数・運動・体組成・睡眠がダッシュボードに出る | 実装済み |
| **2** | `LifeTimeline`（行動ログ参照）+ 論理日マージ | 1日の流れを時系列で振り返れる | 2〜3日 |
| **3** | スクリーンタイム: `/api/health/screentime` + スクショ OCR 取り込み + 週次リマインド | 公式値ベースのスクリーンタイムが入る | 2〜3日 |
| **4** | エンジン v2（行動ドライバー）+ エレナの語り + cron 反映 | エレナが運動・夜スマホを語れる | 3〜4日 |
| **5** | 経路A（App オートメーション）+ `appEvents` 集計 cron | 日次の夜間利用が自動で入る | 2日 |
| **6**（将来） | ネイティブ `DeviceActivityMonitor`（`ios-migration-plan.md` と合流） | しきい値イベントの完全自動化 | iOS 化に依存 |

**Phase 1 を先に出す理由**: 現在の不満（連携済みなのに見えない）が最短で解消され、
かつ以降のフェーズが全てこの受け口の上に乗るため。

---

## 12. テスト計画

既存方針（Vitest + RTL、`npm test` 全パス、カバレッジ 84%+）に従う。

| 追加テスト | 対象 |
|---|---|
| `tests/server/api/health-activity.test.js` | 認証・範囲外値の `null` 化・日付キー |
| `tests/server/api/health-workout.test.js` | **冪等性**（同じ workout を2回 POST しても1件） |
| `tests/server/api/health-sync.test.js` | **部分成功**（1ドメイン失敗でも他は書き込まれる） |
| `tests/server/api/health-screentime.test.js` | カテゴリの `null` 保持・上書き優先順位（screenshot > automation） |
| `tests/unit/behaviorDrivers.test.js` | 行動ドライバーの発火条件・境界値 |
| `tests/unit/screenTimeAggregate.test.js` | `appEvents` の open/close ペアリング、**ペア崩れ時に推定しない**こと |
| `tests/components/ActivityCard.test.jsx` | 全 `null` で非表示・`0` と `―` の区別 |
| `tests/components/LifeTimeline.test.jsx` | 論理日での並び順（深夜の食事が末尾に来る） |
| `tests/unit/vercel-crons.test.js` | 新規 cron の追記（既存テストの更新） |

**回帰で特に守るもの**: `weight` / `sleep` の既存 API は `ingest.js` へのリファクタで
**振る舞いを変えない**。既存テストをそのまま通すことを条件とする。

---

## 13. Phase 1 で実装したもの（2026-07-31）

| ファイル | 役割 |
|---|---|
| `src/lib/health/healthMetrics.js` | 指標定義の唯一の真実。key / 表示名 / 単位 / 許容範囲 / 桁数 |
| `src/lib/health/ingest.js` | 受信の共通処理。認証・数値検証・日付キー・4ドメインの writer |
| `src/app/api/health/sync/route.js` | バッチ受信（部分成功）。**ショートカットはこれ1本で足りる** |
| `src/app/api/health/activity/route.js` | 日次アクティビティ単体 |
| `src/app/api/health/workout/route.js` | ワークアウト（単体/配列・冪等） |
| `src/app/api/health/weight/route.js` | 既存を `ingest.js` へ移行。**`height` を追加** |
| `src/app/api/health/sleep/route.js` | 既存を `ingest.js` へ移行（振る舞いは不変） |
| `src/components/ActivityCard.js` | ダッシュボードの実測カード |
| `src/components/WeightTracker.js` | 履歴に **BMI・除脂肪体重・体脂肪量** を追加表示 |
| `src/app/page.js` | `activityLogs` / `workouts` / `conditionLogs` の読み込みとカード配置 |

**Phase 1 で解決した「反映されない」**:

- §2.1（受け口が無い）→ `/api/health/activity` `/workout` `/sync` を追加
- §2.2（表示面が無い）→ `ActivityCard` で睡眠・アクティビティを表示
- **加えて発覚した分**: `weights` に届いていた **BMI と除脂肪体重も、どこにも表示されていなかった**。
  体脂肪率だけが `WeightTracker` のグラフに出ていた。これも表示するようにした。

**Phase 1 で意図的に見送ったもの**:

- 体脂肪量（kg）は**保存しない**。`weight` を手入力で上書きすると導出値が古いまま残り、
  実際と食い違うため。表示のたびに `calcFatMass()` で計算する。
- コンディションエンジンへの統合（Phase 4）。実測睡眠がまだ 0 件のため、
  行動ドライバーを入れても発火せず、検証ができない。

---

## 14. 未決事項

1. **ショートカットでワークアウト（種目・開始終了時刻）が取れるか** — 実機で 1 度確認する。
   受け口（`/api/health/workout`）は実装済みなので、取れるなら送るだけで動く。
   取れない場合、運動判定は `activeEnergy` と歩数で行う（実機に `exerciseMinutes` が無いため、
   いずれにせよこちらが主経路になる）。
2. **同期の実行回数** — 1日1回（12時）か、2回（12時・23時）か。歩数の当日精度に影響する。
3. **`activityCalorieMode` の既定** — 本設計では `display`（表示のみ）を推奨。Phase 4 で実装。
4. **App オートメーションの対象アプリ** — 本人が「減らしたい」と思っているものを 3〜5 個。
5. **スクリーンタイムのスクショ取り込み頻度** — 週次（日曜）を想定。日次にするなら手間が増える。
