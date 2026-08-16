# コンディション連動アップデート設計書 —「食事が、今日のあなたをつくる」

作成日: 2026-07-29 / 改訂: 2026-07-29（Phase 1〜4 実装完了）
ステータス: **全 Phase 実装済み（実データの蓄積待ち）**
対象: 体重・ダイエット中心の評価軸を、**集中力・睡眠・エネルギー・メンタル**まで広げる

---

## 1. 目的とコンセプト

### 1.1 なぜやるか

現状の Lifelog は「摂取カロリーと PFC が目標に対してどうか」＝**体重の未来**しか語っていない。
しかしユーザーが日々体感しているのは体重ではなく、**今日の頭の冴え・午後の眠気・夜の寝つき**である。
体重は月単位でしか動かないが、コンディションは**その日のうちにフィードバックが返る**。

> 体重は「3ヶ月後の通知表」。コンディションは「今日の通知表」。
> 後者を扱えるようになると、エレナは**ダイエットコーチ → 習慣トレーナー**に進化する。

### 1.2 コンセプト

**「昨日の夕食が、今日の集中力になる」を可視化する。**

- 食事を記録すると、カロリーだけでなく **今日のコンディション予測（4軸）** が出る
- ユーザーは 3タップで **実際の体感** を返す（朝：睡眠 / 夕方：集中力）
- 予測と実測のズレが溜まると、エレナは **その人だけの傾向** を語れるようになる
- エレナは「痩せた/太った」ではなく「**今日、あなたの頭が回っていたのは昨日の夕食のおかげ**」と言えるようになる

### 1.3 スコープ外（明示）

- 医療・診断行為（後述 §12 の表現ガード）
- 疾患・アレルギー・薬物相互作用の管理
- 運動・トレーニング処方（将来 HealthKit の歩数連携で拡張余地あり）

---

## 2. 現状把握（2026-07-29 時点）

| 領域 | 現状 | コンディション対応で足りないもの |
|---|---|---|
| 栄養素 (`macros`) | protein/fat/carbs + fiber/sugar/sodium/potassium | **カフェイン・アルコール・オメガ3・鉄・マグネシウム・トリプトファン・血糖負荷** が無い |
| 評価 (`daily-evaluation.js`) | カロリー収支と PFC を軸に 0-100 点 | 「時間帯」は考慮するが**食べた時刻そのもの**は使っていない（就寝との距離が測れない） |
| 体感データ | 一切なし | **睡眠・集中力の主観ログが無い**ため、予測の答え合わせができない |
| 生体データ | 体重/体脂肪/BMI/除脂肪（HealthKit経由・`api/health/weight`） | **睡眠時間・睡眠ステージ**の受け口が無い |
| 食事の時刻 | `meal.timestamp` に ISO 文字列で保存済み ✅ | 活用されていない（`mealType` のみ参照） |
| 通知 (cron 6本) | 一方通行のプッシュ | 体感を**聞き返す**導線が無い |
| UI (`page.js`) | 拡張栄養素カードあり ✅ | コンディションの表示面が無い |

**良いニュース**: `timestamp` が既にあること、`macros` が `null` 許容で設計されていること、拡張栄養素カードの前例があることで、**基盤の作り直しは不要**。差分追加で成立する。

---

## 3. コアモデル：4つのコンディション軸

食事から因果を語れて、かつユーザーが自己申告できる粒度に絞って **4軸**とする。

| 軸 | key | 意味 | エレナの言い方 |
|---|---|---|---|
| 集中力 | `focus` | 脳の冴え・午後の眠気の少なさ | 「今日は頭が回りそうですよ✨」 |
| 睡眠 | `sleep` | 寝つき・深さ（＝**今夜**の予測） | 「今夜、寝つき悪いかもしれません…😢」 |
| エネルギー | `energy` | 一日を通した安定感・だるさの無さ | 「エネルギー切れしにくい一日です💪」 |
| メンタル | `mood` | ストレス耐性・気分の安定 | 「気持ちが荒れにくい食べ方でした🌈」 |

**設計判断**: 「腸内環境」「むくみ」は独立軸にせず、`mood` / `energy` の**ドライバー（要因）**として扱う。
軸を増やすほどスコアが薄まり、ユーザーの体感入力コストも増えるため。

**時間軸の定義（重要）**

- `focus` / `energy` / `mood` … **その日の日中**を対象。午前の食事までで暫定表示し、食事追加ごとに更新。
- `sleep` … **その日の夜**を対象。夕方以降に確定に近づく。翌朝の主観入力と突き合わせる。

---

## 3.5. 日付ルール — 論理日（4:00 区切り）

**実装で判明した最重要の前提。** 実装は `src/lib/health/conditionDate.js` に集約してある。

ユーザーの就寝は **0:00〜2:00**。この前提だとカレンダー日（0:00 区切り）では因果が壊れる。

| 出来事 | カレンダー日 | 論理日 | 正しいのは |
|---|---|---|---|
| 7/30 1:00 に食べたラーメン | 7/30 | **7/29** | 体感は「7/29 の夜食」。影響が出るのは 7/29→7/30 の睡眠 |

そこで **JST 4:00 を日の境界**とする論理日を導入した。0:00〜3:59 は前日の続きとして扱う。

### 睡眠の帰属ルール

睡眠は「**その夜を引き起こした食事の日**」に紐づける。

```
7/29 の夕食 → 7/29→7/30 の睡眠 → 7/30 朝に回答 → 7/29 のログに保存
```

こうしないと、予測（7/29 の食事から算出）と実測（7/30 に回答）が別キーになり、
Phase 4 の相関分析が一切できなくなる。

さらに深夜の回答も破綻しない：7/30 の 1:00 時点では 7/29→7/30 の睡眠はまだ発生していないため、
「直近で完了した夜」＝ 7/28 の分を指す（`getSleepTargetDateKey`）。

### ダッシュボードとの関係（意図的な非対称）

**食事一覧・カロリー集計は従来どおりカレンダー日のまま**にしてある。
既存の体重・日次評価・ウィジェットが全てカレンダー日を前提にしており、
ここを変えると影響範囲が機能全体に及ぶため。

論理日を使うのはコンディション機能だけ。
**Phase 2 のエンジンは論理日で食事をグルーピングすること**（カレンダー日で組むと深夜の食事が迷子になる）。

### 就寝時刻の日またぎ

`bedtime` が 0:00〜3:59 の場合、その時刻は「翌日」を指す（`resolveBedtime`）。
既定値は **01:00**。`late_meal` の判定はこの解決済み時刻との差分で行う。

---

## 4. 栄養素データモデルの拡張

### 4.1 追加フィールド（Tier 1 = Phase 1 で実装）

`macros` に以下を追加する。**全て `number | null`。既存ルール（`null` = AI が推定できなかった、`0` = 実際にゼロ）を厳守。**

| フィールド | 単位 | 主に効く軸 | 備考 |
|---|---|---|---|
| `caffeine` | mg | sleep(−) / focus(+) | コーヒー1杯≈90mg。**摂取時刻とセットで意味を持つ** |
| `alcohol` | g | sleep(−−) / focus(−) | 純アルコール量。ビール500ml≈20g |
| `omega3` | mg | focus(+) / mood(+) | EPA+DHA 合算。青魚・くるみ |
| `tryptophan` | mg | sleep(+) / mood(+) | 乳製品・大豆・肉 |
| `magnesium` | mg | sleep(+) / energy(+) | ナッツ・海藻・全粒穀物 |
| `iron` | mg | focus(+) / energy(+) | 不足で酸素運搬が落ちる |
| `vitaminD` | µg | mood(+) | 魚・きのこ |
| `saturatedFat` | g | focus(−) | 総脂質だけでは質が見えないため分離 |
| `glycemicLoad` | — | focus(−) / energy(−) | **その食事の推定 GL**。血糖スパイクの代理指標 |
| `ultraProcessed` | 0-3 | mood(−) / energy(−) | 超加工度。0=素材そのもの, 3=菓子パン/カップ麺 |

### 4.2 Tier 2（Phase 4 以降の候補）

`calcium` / `zinc` / `vitaminB12` / `folate` / `vitaminC` / `choline`
→ スキーマが肥大すると画像解析の精度とレイテンシに響くため、Tier 1 の効果を測ってから判断する。

### 4.3 推定精度に関する設計原則

AI による栄養素推定は**絶対値としては信用できない**（特に微量栄養素）。したがって：

1. **閾値判定は幅を持たせる**。`iron >= 7.5` のようなピンポイント判定ではなく、`低 / 標準 / 高` の 3 帯域で扱う。
2. **1食単位ではなく1日単位で集計**してから判定する（微量栄養素は日次合計のみ意味を持つ）。
3. 例外は `caffeine` / `alcohol` / `glycemicLoad` の 3つ。これらは**食事単位＋時刻**で効くため、食事レコード単位で使う。
4. UI では推定値を「〜くらい」と表示し、断定しない。
5. **カフェイン・アルコールは AI 推定に頼らない**。「コーヒー」という料理名から mg を当てるのは
   精度が出ないうえ、睡眠スコアの主要ドライバーなので誤差が致命的になる。
   → **マイドリンク**（固定値プリセット）でワンタップ記録する（`src/lib/health/drinkPresets.js`）。
   飲み物も `meals` コレクションに入れるため、摂取時刻がそのまま判定に使える。

### 4.4 実装箇所

- `src/app/actions/gemini-client.js` の `EXTENDED_MACROS_PROPERTIES` に 10 フィールドを追加
  → `FOOD_ANALYSIS_SCHEMA` / `SUGGESTION_ITEM_SCHEMA` / `RECIPE_CALC_SCHEMA` / `RECIPE_HYBRID_SCHEMA` に自動波及する（既に共通定数化されているため差分は 1 箇所）
- 各 actions のプロンプトに「**推定できない栄養素は 0 ではなく null を返すこと**」を明記（既存の暗黙ルールを明文化）
- `src/lib/firebase/firestore.js` の `addSearchHistory` の `macrosPayload` に新フィールドの null 明示を追加
- `src/app/page.js` の `getDailyTotals` に新フィールドの合算（既存の `fiber` と同じ `!= null` パターン）

---

## 5. 影響推定エンジン（アーキテクチャの中核）

### 5.1 二層構造 — これが最重要の設計判断

```
┌─────────────────────────────────────────┐
│ 第1層: 決定論スコアエンジン（純粋関数・コード）   │
│  src/lib/health/conditionEngine.js       │
│  食事 + 時刻 + 栄養素 → 4軸スコア(0-100)     │
│  + 発火したドライバー一覧 + confidence      │
└──────────────┬──────────────────────────┘
               │ 数値とドライバーを渡すだけ
┌──────────────▼──────────────────────────┐
│ 第2層: エレナの語り（Gemini）                │
│  src/app/actions/condition-analysis.js   │
│  スコアを「解釈」して物語にする。再計算はしない  │
└─────────────────────────────────────────┘
```

**なぜ分けるか**:

- **再現性**: 同じ食事なら常に同じスコア。AI に採点させると日によってブレて信用を失う
- **説明可能性**: 「なぜ 42 点か」をドライバー一覧で必ず説明できる。ハルシネーションが混ざらない
- **コスト/速度**: スコア表示は API 呼び出しゼロ。食事を追加した瞬間にリアルタイム更新できる
- **テスト可能性**: 純粋関数なので Vitest で網羅的に検証できる
- **パーソナライズ**: 後から重み係数だけ差し替えれば個人最適化できる（§8）

エレナには「**数値は既に確定している。あなたの仕事は解釈と励ましだ**」とプロンプトで明示する。

### 5.2 ドライバー定義

重み係数は `src/lib/health/conditionRules.js` に**定数テーブル**として切り出す（チューニングとテストのため）。
各軸は **base 60 点**から加減算し、0-100 にクランプする。

#### focus（集中力）

| ドライバー | 条件 | 重み |
|---|---|---|
| `breakfast_protein` | 朝食のタンパク質 ≥ 20g | +8 |
| `breakfast_skipped` | 11時までに食事記録なし | −10 |
| `lunch_carb_bomb` | 昼食の GL が高 かつ protein < 15g かつ fiber < 5g | −15 |
| `lunch_heavy` | 昼食が1日目標カロリーの 45% 超 | −8 |
| `omega3_sufficient` | 1日 omega3 ≥ 500mg | +6 |
| `iron_low` | 1日 iron が低帯域 | −6 |
| `saturated_fat_high` | 1日 saturatedFat が高帯域 | −5 |
| `caffeine_morning` | 6-14時のカフェイン 50-300mg | +5 |
| `caffeine_excess` | 1日 caffeine > 400mg | −5 |
| `dehydration_proxy` | 1日 sodium 高 かつ potassium 低 | −4 |

#### sleep（睡眠）

| ドライバー | 条件 | 重み |
|---|---|---|
| `late_meal` | 就寝予定時刻の 3時間以内に食事 | −15 |
| `late_meal_fatty` | 上記かつその食事の fat > 25g | 追加 −8 |
| `alcohol` | 1日 alcohol ≥ 20g | −18（≥40g で −25） |
| `caffeine_late` | 14時以降のカフェイン | −12 /件（下限 −25） |
| `tryptophan_carb_combo` | 夕食に tryptophan ≥ 250mg かつ carbs 20-60g | +6 |
| `magnesium_sufficient` | 1日 magnesium ≥ 300mg | +5 |
| `dinner_carb_excess` | 夕食の carbs > 120g | −5 |
| `dinner_light_early` | 夕食が就寝4時間以上前かつ 700kcal 未満 | +8 |

> 就寝予定時刻はプロフィール `profile.bedtime` を使う。**未設定でも既定値では補完しない**。
> 推測した就寝時刻で 15点も減点するのは「推測で減点しない」原則に反するため。
> 未設定の間は `late_meal` / `late_meal_fatty` / `dinner_light_early` が発火せず、
> sleep の confidence が `low` に固定される。UI 側はカードから設定を促す。
> （入力欄の初期表示は `01:00`。設定は1タップで済む）

### 途中経過で「不足」を責めないルール（実装で追加）

1日合計の不足を責めるドライバー（`iron_low` / `magnesium_iron_low` / `calorie_deficit_severe` /
`sodium_potassium_imbalance`）は、**その日が終わってからしか発火させない**。

```
isDayComplete = 夕食が記録済み || 論理時刻 21時以降
```

朝食だけ記録した 9時の時点で「鉄が足りません」「カロリー不足です」と減点するのは理不尽で、
スコアが朝は常に低く夜に向かって上がるという無意味な挙動になる。

一方で**充足の加点は時間帯を問わず発火**させる（早い段階で目標に届いたのは純粋に良いことなので）。
同様に `breakfast_skipped` は論理時刻 11時を過ぎるまで発火しない。

#### energy（エネルギー安定）

| ドライバー | 条件 | 重み |
|---|---|---|
| `meal_gap_long` | 食事間隔 > 6時間 | −8 |
| `fiber_sufficient` | 1日 fiber ≥ 20g | +8 |
| `sugar_fiber_ratio_bad` | 1食の sugar / fiber > 15 | −10 /件（下限 −20） |
| `protein_sufficient` | 1日 protein ≥ 体重 × 1.2g | +6 |
| `calorie_deficit_severe` | 摂取が目標の 70% 未満（かつ21時以降） | −12 |
| `magnesium_iron_low` | magnesium と iron が両方低帯域 | −6 |
| `ultra_processed_high` | 1日の ultraProcessed 平均 ≥ 2.0 | −8 |

#### mood（メンタル）

| ドライバー | 条件 | 重み |
|---|---|---|
| `fiber_sufficient` | 1日 fiber ≥ 20g | +7 |
| `fermented_food` | 発酵食品を含む（`foodName` キーワード + AI 判定） | +5 |
| `omega3_sufficient` | 1日 omega3 ≥ 500mg | +6 |
| `vitaminD_sufficient` | 1日 vitaminD ≥ 8µg | +4 |
| `ultra_processed_high` | 1日の ultraProcessed 平均 ≥ 2.0 | −10 |
| `alcohol` | 1日 alcohol ≥ 20g | −8 |
| `calorie_deficit_severe` | 摂取が目標の 70% 未満 | −10 |

### 5.3 confidence（信頼度）— データ不足時の設計

**スコアを出せない日に無理やり数値を出すのが最大の信用毀損**。以下で必ずガードする。

```js
confidence = f(記録された食事数, 該当軸に効く栄養素の充足率, プロフィール設定率)
// 'high' | 'medium' | 'low' | 'insufficient'
```

- `insufficient`（食事0-1件、または軸に効く栄養素がほぼ全て null）
  → **スコアを表示しない**。「まだ判定できません。記録を増やしてくださいね😊」
- `low` → スコアはグレー表示 + 「参考値です」バッジ
- `medium` / `high` → 通常表示

過去データ（新フィールド追加前の食事）は自然に `low` / `insufficient` に落ちるため、**マイグレーション不要**。

### 5.4 出力形式

```js
// conditionEngine.evaluate(input) の戻り値
{
  date: '2026-07-29',
  axes: {
    focus:  { score: 72, grade: 'good', confidence: 'medium',
              drivers: [{ key: 'breakfast_protein', label: '朝食のタンパク質', delta: +8 }, ...] },
    sleep:  { score: 38, grade: 'warn', confidence: 'high', drivers: [...] },
    energy: { score: 61, grade: 'normal', confidence: 'medium', drivers: [...] },
    mood:   { score: null, grade: null, confidence: 'insufficient', drivers: [] },
  },
  topPositive: { axis: 'focus', driver: 'breakfast_protein' },
  topNegative: { axis: 'sleep', driver: 'caffeine_late' },
  version: 1,   // ルール改訂時にインクリメント（過去スコアとの互換管理）
}
```

`grade`: `great`(85+) / `good`(70+) / `normal`(55+) / `warn`(40+) / `bad`(<40)

---

## 6. 体感フィードバック（実測ログ）

予測だけでは「当たっているのか」が永遠に分からない。**3タップの主観入力**を必ずセットで作る。

### 6.1 入力設計（摩擦の最小化が命）

| タイミング | 聞くこと | UI |
|---|---|---|
| 朝（起床後の初回起動 / 朝のプッシュ） | 「昨夜、よく眠れましたか？」5段階アイコン | 1タップ |
| 夕方（16-19時 / afternoon-check の返信） | 「今日の集中力は？」5段階 | 1タップ |
| 任意 | 自由メモ | 折りたたみ |

- **1日1回まで**。スキップ可。連続スキップしても催促は 3日に1回まで（習慣アプリとして嫌われない）
- LINE の quick reply でも回答できるようにする（`src/lib/line/handlers/condition.js`）
- 5段階は絵文字（😩 😕 😐 🙂 😄）で、文字を読ませない

### 6.2 HealthKit 睡眠データ連携

既存の `src/app/api/health/weight/route.js` と**完全に同じ認証・日付キー方式**で新設する。

`POST /api/health/sleep` （`x-widget-token` 認証）

```js
{ uid, sleepStart, sleepEnd, inBedMinutes, asleepMinutes,
  deepMinutes, remMinutes, awakenings, measuredAt }
// 全て number|null（HealthKit のソースにより取れない項目がある）
```

→ `users/{uid}/conditionLogs/{YYYY-MM-DD}` の `sleep.objective` にマージ。
**主観入力があれば主観を優先表示、客観は補助**（客観値はデバイス差が大きく、主観の方が体感と相関するため）。

---

## 7. データモデル（Firestore）

### 7.1 新規コレクション `users/{uid}/conditionLogs/{YYYY-MM-DD}`

**日付キーは論理日（4:00 区切り）**。§3.5 のルールに従う。

```js
{
  date: '2026-07-29',
  // --- 実測（ユーザー入力 / HealthKit） ---
  sleep: {
    subjective: 3,          // 1-5 | null
    objective: {            // HealthKit（あれば）
      asleepMinutes: 402, deepMinutes: 68, remMinutes: 91,
      awakenings: 2, sleepStart: '...', sleepEnd: '...',
    } | null,
    source: 'manual' | 'healthkit' | 'both',
  },
  focus:  { subjective: 4, recordedAt: '2026-07-29T17:20:00+09:00' } | null,
  energy: { subjective: null } | null,
  mood:   { subjective: null } | null,
  note: '',
  // --- 予測スナップショット（その日の確定時点のエンジン出力） ---
  predicted: { focus: 72, sleep: 38, energy: 61, mood: null },
  engineVersion: 1,
  createdAt, updatedAt,
}
```

**設計判断**: `predicted` を**日次でスナップショット保存する**。
ルールを後から改訂しても過去の予測が書き換わらず、相関分析（§8）が壊れない。

### 7.2 新規ドキュメント `users/{uid}/insights/conditionModel`

```js
{
  updatedAt,
  sampleDays: 21,
  // ドライバー別の個人補正係数（0.5 〜 1.5）
  driverWeights: { caffeine_late: 1.4, late_meal: 0.7, ... },
  // 表示用の「あなたの傾向」文
  findings: [
    { axis: 'sleep', driver: 'caffeine_late', direction: 'negative',
      observedDelta: -1.2, days: 9, confidence: 'medium' },
  ],
}
```

### 7.3 プロフィール拡張 `users/{uid}`

```js
{
  bedtime: '01:00',        // 就寝予定時刻（sleep 軸に必須）。0:00〜3:59 は翌日扱い
  wakeTime: '08:00',
}
```

`ConditionCheckIn` の歯車アイコンから編集する。
（`DietPlanWizard.js` はどこからも参照されていない未使用コンポーネントだったため、そちらには追加していない）

### 7.4 新規コレクション `users/{uid}/drinkPresets/{id}`

```js
{ name: 'いつものコンビニコーヒー', calories: 10,
  macros: { protein: 0, fat: 0, carbs: 0, caffeine: 120, alcohol: 0, /* 他は null */ },
  createdAt }
```

既定プリセット9種（コーヒー・カフェラテ・緑茶・紅茶・エナジードリンク・水/麦茶・ビール・ハイボール・ワイン）は
DB に置かずコード側の定数として持つ（`drinkPresets.js`）。ユーザー登録分だけを Firestore に保存する。

記録時は通常の `meals` ドキュメントとして書き込む（`mealType: 'snack'`, `source: 'drink-preset'`）。
飲み物を別コレクションにしないのは、**エンジンが食事と飲み物を時刻順に一様に読めるようにする**ため。

### 7.5 既存への影響

- `meals` … `macros` にフィールド追加のみ（**破壊的変更なし**）
- `dailyEvaluations` … 変更なし（コンディションは別コレクション）
- 過去データ … 新フィールドは `undefined` → 読み出し側で `?? null` に正規化。`confidence` が下がるだけで壊れない

---

## 8. パーソナライズ（n=1 の学習）

**Phase 4**。一般論から「あなたの場合」に進化させる、この機能の本丸。

### 8.1 やること

1. 直近 60日の `conditionLogs` から、`(予測ドライバーの発火有無, 実測主観スコア)` のペアを作る
2. ドライバーごとに **発火した日の実測平均 − 発火しなかった日の実測平均** を計算
3. サンプル数 `n >= 7`（両群それぞれ）を満たすドライバーだけを採用
4. 効果が一般論より大きい/小さい分だけ `driverWeights` を **0.5〜1.5 倍の範囲で補正**（暴走防止のクランプ）

### 8.2 統計に対する誠実さ（設計上の制約）

- **これは因果推論ではなく相関の観察**。UI・エレナの発言ともに「傾向がありそう」以上のことは言わない
- `n < 7` の知見は**保存はするが表示しない**
- 「相関が見つからなかった」も価値ある結果として表示する（「あなたはカフェインに強いみたいですね☕」）
- 交絡（週末は飲酒も夜更かしも同時に起きる等）は補正しない。だからこそ断定しない

### 8.3 エレナの見せ場

> 「あなた、14時以降のコーヒーを飲んだ日は睡眠の自己評価が平均 1.2 も下がってるんですよ…！9日分のデータです。
>  一般論じゃなくて、**あなたのデータ**がそう言っています😤 明日から15時以降は麦茶にしませんか？」

これは既存のどの機能にもない「エレナがユーザーを個人として知っている」感の演出になる。IP育成の観点でも中核。

---

## 9. AI 層の設計

### 9.1 新規: `src/app/actions/condition-analysis.js`

```js
export const analyzeCondition = async (engineResult, context) => { ... }
```

- 入力: エンジンの出力（スコア・ドライバー）、その日の食事概要、直近の実測ログ、`insights` の findings
- **AI にスコアを計算させない**。プロンプトに「与えられた数値を変更・再計算してはいけません」を明記
- `THINKING.MEDIUM`、`MODELS_TO_TRY` のフォールバックは既存踏襲

### 9.2 スキーマ `CONDITION_ANALYSIS_SCHEMA`（`gemini-client.js` に追加）

```js
{
  characterStatus: STRING,        // 既存の [STATUS: XXX] 形式を再利用
  headline: STRING,               // 「今日は頭が回る一日になりそうです✨」
  axisComments: {
    focus:  { comment: STRING, nullable: true },
    sleep:  { comment: STRING, nullable: true },
    energy: { comment: STRING, nullable: true },
    mood:   { comment: STRING, nullable: true },
  },
  keyInsight: STRING,             // 最も効いた要因の解説（なぜそうなるかの生理学的説明）
  tonightAction: STRING,          // 今夜/明日できる具体的な1アクション
  reasoning: STRING,
}
```

### 9.3 既存 `evaluateDailyLog` との関係

**統合しない。** 理由：

- プロンプトが既に長大（約 200行）で、これ以上詰めると指示追従性が落ちる
- ダイエット評価とコンディション評価は**呼び出しタイミングが違う**（前者は任意/日次、後者は食事追加ごとに軽量更新）
- 既存テスト（`tests/server/actions/`）への影響を最小化できる

ただし `evaluateDailyLog` のプロンプトには **1行だけ**コンテキストを渡す：
`【今日のコンディション予測】集中力72 / 睡眠38 / エネルギー61` 
→ エレナの日次評価とコンディション評価で発言が矛盾しなくなる（LINE の会話履歴連携と同じ思想）。

### 9.4 食事アドバイザーの拡張

`meal-advisor.js` の提案理由に**コンディション観点を追加**する。
「カロリー的にOK」だけでなく「**この後の会議に向けて頭を回すなら**これ」と言えるようにする。
入力に現在時刻・今日の focus スコア・就寝までの残り時間を渡す。

---

## 10. UI 設計

### 10.1 新規コンポーネント（すべて `next/dynamic` で動的インポート）

| ファイル | 役割 |
|---|---|
| `src/components/ConditionCard.js` | ダッシュボードの 4軸ミニゲージ。タップでモーダル |
| `src/components/ConditionModal.js` | 詳細：軸別スコア + ドライバー内訳（+/− の要因リスト）+ エレナのコメント + 今夜のアクション |
| `src/components/ConditionCheckIn.js` | 5段階アイコンの体感入力（朝/夕） |
| `src/components/ConditionTrendChart.js` | 予測 vs 実測の推移（recharts）。Phase 4 |

### 10.2 ダッシュボード（`page.js`）への統合

拡張栄養素カードの**直下**に `ConditionCard` を置く。既存レイアウトの並びを崩さない。

```
[カロリー/PFC サマリー]
[拡張栄養素カード]      ← 既存
[コンディションカード]    ← 新規（4軸ゲージ横並び、insufficient は「―」）
[食事一覧]
```

ミニゲージは grade に応じた色：`great`=#68D391 / `good`=#9AE6B4 / `normal`=#F6E05E / `warn`=#F6AD55 / `bad`=#FC8181
（既存 designSystem のパレットに合わせる）

### 10.3 表示の原則

- **数値だけを出さない**。必ず「なぜ」が1行つく（「昨日 22時のコーヒーが効いています☕」）
- スコアが低い時に**責めない**。コンディションは自己管理の失敗ではなく「体の反応」として語る
- `insufficient` の時は空欄ではなく「記録が増えると見えてきますよ😊」と次の行動を示す

---

## 11. 通知 / LINE 連携

| Cron | 追加すること |
|---|---|
| `morning-boost` | 「昨夜よく眠れましたか？」の5段階 quick reply。回答→ `conditionLogs.sleep.subjective` に保存 |
| `afternoon-check` | 「今日の集中力は？」の5段階 quick reply |
| `evening-preview` | **今夜の睡眠予測**を伝える。「今日は21時以降の食事を控えると寝つきが良くなりますよ🌙」← 行動変容の最大チャンス |
| `weekly-summary` | 週次のコンディション推移 + 相関知見（Phase 4） |

新規ハンドラ `src/lib/line/handlers/condition.js` を `router.js` の postback 分岐に追加。
既存の postback ハンドラと同じパターンなので実装は薄い。

**新規 cron は作らない。** 既存6本に相乗りする（Vercel の cron 上限とユーザーの通知疲れの両方を避ける）。

---

## 12. 表現ガード（医療的断定の回避）

エレナは栄養学に詳しいコーチであって、医師ではない。以下をプロンプト制約に追加する。

**禁止**
- 「診断」「治療」「処方」の語、および疾患名を伴う断定（「それは鉄欠乏性貧血です」）
- 「必ず〜になります」「〜すれば治ります」等の確定的因果
- サプリメントの具体的用量指示

**推奨表現**
- 「〜しやすい傾向があります」「〜と言われています」「あなたのデータでは〜でした」
- 体調不良が続く場合は「一度お医者さんに相談してくださいね」と促す

`gemini-client.js` に `HEALTH_DISCLAIMER_RULE` 定数として切り出し、コンディション系プロンプト全てに差し込む。
UI にも小さく「本機能は一般的な栄養学に基づく推定であり、医学的診断ではありません」を常設。

**エレナの人格は変えない**。厳しさや感情表現はそのまま。断定の対象が「あなたの怠慢」から「体のメカニズム」に変わるだけ。

---

## 13. 実装フェーズ

### Phase 1 — データ基盤（土台） ✅ 実装済み

| ファイル | 内容 |
|---|---|
| `src/lib/health/nutrients.js` | **新規**。拡張栄養素の唯一の真実。定義を1箇所に足せばスキーマ・プロンプト・日次集計に自動反映 |
| `src/lib/health/conditionDate.js` | **新規**。論理日・睡眠帰属・就寝時刻の日またぎ（§3.5） |
| `src/lib/health/drinkPresets.js` | **新規**。マイドリンクの既定プリセット（固定値のカフェイン/アルコール） |
| `src/app/actions/gemini-client.js` | `EXTENDED_MACROS_PROPERTIES` を定義から生成するよう変更（Tier1 10フィールド追加） |
| `src/app/actions/{image-analysis,food-search,recipe}.js` | 重複していた栄養素指示文を共通定数に集約 + null ルール明文化 |
| `src/lib/firebase/firestore.js` | `conditionLogs` CRUD、`drinkPresets` CRUD、検索履歴の null 正規化 |
| `src/app/api/health/sleep/route.js` | **新規**。HealthKit 睡眠受信 API（認証・日付方式は weight API 踏襲） |
| `src/components/ConditionCheckIn.js` | **新規**。5段階1タップの体感入力 + 生活リズム設定 |
| `src/components/DrinkQuickLog.js` | **新規**。マイドリンクのワンタップ記録・登録・削除 |
| `src/app/page.js` | `getDailyTotals` を共通集計に置換、2コンポーネントを動的インポートで統合 |

テスト: `tests/unit/nutrients.test.js` / `tests/unit/conditionDate.test.js` /
`tests/server/api/health-sleep.test.js` / `tests/server/firebase/firestore-condition.test.js` /
`tests/components/{ConditionCheckIn,DrinkQuickLog}.test.jsx` → **773 tests passing**

**この Phase 単体ではスコアが出ない。** それでも先にやる理由は、相関分析に必要な実測データは**過去に遡って集められない**ため。1日でも早くログを溜め始める。

### Phase 2 — スコアエンジン ✅ 実装済み

| ファイル | 内容 |
|---|---|
| `src/lib/health/conditionRules.js` | **新規**。重み・閾値・帯域・グレード・confidence 規則。**データのみ**でロジックを持たない |
| `src/lib/health/conditionEngine.js` | **新規**。純粋関数。33 のドライバーを判定し4軸スコア + 内訳 + confidence を返す |
| `src/components/ConditionCard.js` | **新規**。4軸ミニゲージ + 最も効いた要因の一行 + 免責 |
| `src/components/ConditionModal.js` | **新規**。軸ごとのドライバー内訳（±値と根拠）を全開示 |
| `src/app/page.js` | 予測の算出（useMemo）、日次スナップショット保存、カード/モーダル統合 |
| `src/lib/health/conditionDate.js` | `getLogicalHour` / `filterMealsForLogicalDate` を追加 |

テスト: `tests/unit/conditionEngine.test.js`（55件・全ドライバーの発火/非発火・境界値・clamp・
confidence・異常入力）、`tests/components/{ConditionCard,ConditionModal}.test.jsx`
→ **851 tests passing**

スナップショット保存は「予測スコアが変わった時だけ」書き込む（`useRef` で直前の値と比較）。
1日あたり数回の書き込みに収まる。

### Phase 3 — エレナの語り ✅ 実装済み

| ファイル | 内容 |
|---|---|
| `src/app/actions/condition-analysis.js` | **新規**。エンジンの数値を解釈させる。`THINKING.OFF` |
| `src/lib/health/conditionMessages.js` | **新規**。通知用の短文（AI を呼ばない決定論） |
| `gemini-client.js` | `CONDITION_ANALYSIS_SCHEMA` / `HEALTH_DISCLAIMER_RULE` / `buildPrompt` 追加、`gemini-3.6-flash` を先頭に |
| `daily-evaluation.js` | 静的プロンプトを前方に集約、コンディション1行を注入 |
| `ConditionModal.js` | モーダルを開いた時にだけエレナの解説を取得 |
| `api/cron/evening-preview` | 今夜の睡眠予測を通知に追加 |
| `page.js` | 水分だけの記録では Gemini を呼ばない |

テスト: `tests/server/actions/condition-analysis.test.js`（18件）、
`tests/unit/conditionMessages.test.js`、`daily-evaluation.test.js` にプロンプト順序の回帰テスト
→ **894 tests passing**

#### コスト設計（実測にもとづく4つの判断）

| 判断 | 理由 | 効果 |
|---|---|---|
| condition解説は **`THINKING.OFF`** | 二層構造なので判断はエンジンが済ませている。AI は言い換えるだけで、thinking 予算は無駄 | 1回あたり -57% |
| 呼び出しは **モーダルを開いた時だけ** | コーヒー1杯で語りが書き換わるのは体験として不自然。レイテンシも増える | 呼び出し回数を 1/3 以下に |
| **水分だけの記録では Gemini を呼ばない** | 水・お茶・ブラックコーヒーは1日のカロリー/PFC評価を数値的に動かさない。カフェインは決定論エンジンが拾うので精度は落ちない | 該当記録のコストが 0 に |
| **静的な指示を前方に集約** | implicit caching はリクエスト先頭のプレフィックス一致でしか効かない（Flash は1,024トークン以上で75〜90%割引）。内容は変えず順番だけ揃えた | 連続呼び出し時の入力が最大75%引き |

加えて `gemini-3.6-flash` を優先モデルの先頭に置いた（出力 $9.00→$7.50/M）。

**結果（1日8件・うち3件が水分・モーダル3回/日の想定）: 月 1,091円 → 613〜712円（-35〜44%）。**
コンディション機能を追加した上で、変更前より安くなっている。

> キャッシュの割引は実際にヒットした時のみ。implicit cache には TTL があるため、
> 数時間空いた呼び出しでは効きません。確実に効くのは 712円/月 の方で、
> 613円は記録が連続した時の下限値です。

#### 通知に AI を使わなかった理由

当初は夜の通知でも `analyzeCondition` を呼ぶ設計だったが、実装時に見直した。
プッシュ通知は100文字ほどしか読まれないのに、AI は466文字を生成する。切り詰めるなら最初から
定型文でよい。しかも**ドライバー別の定型文ならカード表示と必ず一致する**（AI が別のことを言い出さない）。
AI の出番は、腰を据えて読むモーダルの中だけに絞った。

### Phase 4 — パーソナライズ ✅ 実装済み（学習は実データ待ち）

| ファイル | 内容 |
|---|---|
| `src/lib/health/correlation.js` | **新規**。ドライバー別の相関観察と個人係数の算出 |
| `src/components/ConditionTrendChart.js` | **新規**。予測 vs 実測の推移（recharts） |
| `conditionEngine.js` | `driverWeights` を受け取り各ドライバーの重みに乗算 |
| `firestore.js` / `adminHelpers.js` | `insights/conditionModel` の読み書き（クライアント/Admin 両方） |
| `api/cron/weekly-summary` | 週1回だけ相関分析を回してモデルを更新し、知見を通知に載せる |
| `page.js` | 学習済み係数をエンジンとエレナに渡す |

テスト: `tests/unit/correlation.test.js`（24件）、
`tests/components/ConditionTrendChart.test.jsx`、エンジンの係数適用テスト
→ **944 tests passing**

#### 実装で塞いだ設計の穴

Phase 2 の予測スナップショットは**スコアしか保存していなかった**。
これでは「どのドライバーが発火した日か」が分からず、相関分析が原理的に不可能だった。
`firedDrivers`（軸ごとの発火キー配列）も一緒に保存するよう変更した。

過去のメニューから再計算しない点も重要で、**当時発火した事実をそのまま残す**ことで
ルール改訂後も過去の分析が壊れない（スナップショットを置いた本来の目的がここで効く）。

#### 統計に対する誠実さ（コードで強制している制約）

| 制約 | 実装 |
|---|---|
| サンプル不足の知見は表示しない | 発火群・非発火群が**それぞれ7日以上**必要。満たさなければ `findings` に入れない |
| 係数の暴走を防ぐ | 個人係数を **0.5〜1.5 にクランプ** |
| 少数データで符号を反転させない | 観測が想定と逆方向でも符号は変えず、下限(0.5)まで弱めるだけ |
| 「見つからなかった」も結果 | 差が 0.2 未満なら「ほとんど変わっていません」と明示する |
| 交絡は補正しない | 週末は飲酒も夜更かしも同時に起きる。**だからこそ断定しない**文面に固定 |

主観1ポイント ≒ エンジン20ポイントとして換算し、
「一般論どおりならこれだけ動くはず」との比を係数にしている。

#### 学習のタイミング

**週次サマリー（cron）で週1回だけ**。純粋な集計なので Gemini は使わず、追加の API コストはゼロ。
学習結果は次回以降のスコアとエレナの語りに反映される。

学習前でも機能は完全に動く（係数が全て 1 ＝ 一般論のまま）。

---

## 14. テスト方針

| 対象 | 方針 |
|---|---|
| `conditionEngine.js` | **最重要**。純粋関数なのでケース網羅。各ドライバーの発火/非発火、境界値、clamp、confidence の全段階 |
| `conditionRules.js` | 定数の整合性（重みの符号、キーの重複なし） |
| `correlation.js` | サンプル数不足時に知見を出さないこと、係数のクランプ |
| `api/health/sleep` | 既存 `api/health/weight` のテストを踏襲（認証・バリデーション・JST日付キー） |
| `condition-analysis.js` | `tests/mocks/gemini.js` を使い、**AIがスコアを書き換えても採用しない**ことを検証 |
| コンポーネント | `ConditionCard` / `ConditionCheckIn` / `ConditionModal`。`insufficient` 時に数値を出さないことを必ずテスト |

既存カバレッジ（84%+ statements）を下げないこと。エンジンは純粋関数なので 95%+ を目標にできる。

---

## 15. リスクと対応

| リスク | 対応 |
|---|---|
| 微量栄養素の AI 推定が不正確 | 帯域判定・日次集計・「〜くらい」表示。絶対値を見せない（§4.3） |
| スコアが体感と合わず信用を失う | `confidence` ガード、Phase 4 の個人補正、予測 vs 実測の可視化で「学習中」を見せる |
| 体感入力が続かない | 1タップ・スキップ可・催促は3日に1回まで。入力しなくても予測は動く設計にする |
| 軸が増えて画面が複雑化 | 4軸固定。ダッシュボードはミニゲージのみ、詳細はモーダルに退避 |
| プロンプト肥大で既存機能が劣化 | コンディション評価は独立 action。既存 `evaluateDailyLog` への注入は1行のみ |
| 医療的な誤解 | §12 の表現ガード + 常設ディスクレーマ |
| ダイエット機能が薄まる | コンディションは**追加**であって置換ではない。既存の評価・スコアはそのまま残す |

---

## 16. 将来への接続

- **iOS 移行**（`docs/ios-migration-plan.md`）: HealthKit の睡眠・歩数・心拍変動を直接読めるようになると、実測データの質が跳ね上がる。`api/health/sleep` は Web でも iOS でも同じ受け口として機能するので**先に作っておく価値がある**
- **習慣トレーナーへの進化**: コンディション軸ができると「食事」以外の習慣（就寝時刻・水分・散歩）を同じフレームで扱える。`conditionRules.js` にドライバーを足すだけで拡張可能な構造にしてある
- **エレナの記憶**: `insights/conditionModel` の findings は、エレナが「ユーザーを知っている」ことの実体になる。LINE 会話のコンテキストにも渡せる

---

## 17. 決定事項サマリー

1. コンディションは **focus / sleep / energy / mood の4軸**に固定する
2. スコアは **決定論エンジンが計算し、AI は解釈のみ**を担当する（再現性・説明可能性・コストのため）
3. 栄養素は **Tier1 の10フィールド**を追加し、全て `null` 許容。微量栄養素は**日次集計・帯域判定**でのみ使う
4. **予測と実測を必ずセット**にする。実測（体感3タップ）は Phase 1 から始めてデータを溜める
5. `predicted` は**日次スナップショット**で保存し、ルール改訂後も過去の分析が壊れないようにする
6. データ不足時は **スコアを出さない**（`confidence: insufficient`）
7. 既存のダイエット評価は**残す**。コンディションは別 action・別コレクションで**非破壊的に追加**する
8. 新規 cron は作らず、**既存6本に相乗り**する
9. 医療的断定を避ける表現ガードを**プロンプト定数として一元管理**する

---

## 18. 決定済みの論点（2026-07-29）

| 論点 | 決定 | 備考 |
|---|---|---|
| 就寝時刻 | **単一値**（曜日別にはしない）。既定 `01:00` | ユーザーの就寝は 0:00〜2:00。ズレが大きいと分かってから曜日別を検討 |
| カフェイン/アルコールの精度 | **マイドリンク方式**（固定値プリセット）を Phase 1 で実装 | AI 推定は使わない。睡眠の主要ドライバーなので精度優先 |
| 体感入力の頻度 | **夕方1回**（集中力）+ 睡眠1回 | 2回にすると続かない。相関が弱ければ後から増やす |
| Phase 1 のリリース単位 | **Phase 1 単体でリリース** | 実測ログは過去に遡って集められないため、1日でも早く溜め始める |

### Phase 2 で決めたこと

| 論点 | 決定 |
|---|---|
| 就寝時刻の既定値補完 | **しない**。未設定なら睡眠ドライバーを発火させず confidence を low に固定 |
| 途中経過での不足判定 | 夕食記録済み or 21時以降（`isDayComplete`）まで発火させない |
| confidence の閾値 | high: 3食以上かつ栄養素カバー率70%、medium: 2食以上かつ40%、下回れば insufficient |
| 表示順 | コンディションカード → 体感チェックイン → マイドリンク（予測を見てから体感を答える流れ） |
| スナップショット保存 | 予測スコアが変化した時だけ書き込む |

### 残っている宿題（実データが溜まってから）

- **重み係数のチューニング**: §5.2 の表は一般論からの出発点。数日使って体感と乖離している軸がないか確認する。
  ズレていれば `conditionRules.js` の数値だけ直せばよい
- **Tier 2 栄養素の追加判断**（§4.2）: Tier 1 の効果を測ってから
- **体感入力を1日2回に増やすか**: 夕方1回で相関が弱いようなら午前/午後に分ける
