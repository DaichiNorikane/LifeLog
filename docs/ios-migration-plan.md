# Lifelog iOS ネイティブアプリ移行計画書

**作成日**: 2026-06-23  
**改訂日**: 2026-06-24（無料/有料の境界・HealthKit要件・Mac前提の実機インストール手順・OTA更新を反映）  
**対象**: 現行 Next.js Web アプリ → iOS ネイティブアプリ  
**前提**: Claude Code を使った個人開発 / 開発機は **Mac**

---

## 0. 改訂サマリー（2026-06-24）

初版は「Apple Developer Program（年99ドル）に最初から登録する」前提で書かれていたが、
検討の結果、以下を明確化した。

- **無料（Apple Developer Program なし）でできる範囲**と、**有料が必須の範囲**を分離した。
- **HealthKit は実機で使うなら有料 Program が必須**であることを確認（後述）。
- 開発機が **Mac** のため、SideStore 等を使わず **Xcode 経由で自分の iPhone に直接インストール**できる。
- **EAS Update（OTA）** で、再ビルドなしに JS をリアルタイム更新できる（当初要件「更新をリアルタイムに」に対応）。
- 当初要件「ネット接続がなくても使える」は、**ローカル DB に入った食事履歴の参照・記録は可能／AI 機能はオンライン必須**という形になる。

### 無料 / 有料の境界（最重要）

| 機能 | 無料（Apple ID のみ）| 有料 Program（年99ドル）|
|---|---|---|
| 食事記録・閲覧・AI 評価（Vercel API 経由）| ✅ 可能 | ✅ 可能 |
| Firebase 認証・Firestore 同期 | ✅ 可能 | ✅ 可能 |
| オフライン（WatermelonDB ローカル DB）| ✅ 可能 | ✅ 可能 |
| 自分の iPhone への実機インストール（Mac + Xcode）| ✅ 可能（※7日制限）| ✅ 可能 |
| **HealthKit（歩数・睡眠）** | ❌ **不可（有料必須）** | ✅ 可能 |
| **ホーム画面ウィジェット（App Groups）** | ❌ **不可（有料必須）** | ✅ 可能 |
| **ネイティブ通知（APNs）** | ❌ **不可（有料必須）** | ✅ 可能 |
| TestFlight 配布 / App Store リリース | ❌ 不可 | ✅ 可能 |

> **理由**: HealthKit / App Groups / Push は Apple の「特別な entitlement（権限）」が必要で、
> これらは Apple Developer ポータルで App ID に有効化する必要がある。
> その操作は**有料メンバーのみ**可能。無料 Apple ID（Personal Team）の署名では
> 「provisioning profile が HealthKit に対応していない」等のエラーでビルドが通らない。

### 方針の結論

- **HealthKit の優先度が高い**ため、本物の使用感（自分の歩数・睡眠でエレナが評価）を確認するには
  **実機での HealthKit 動作＝有料 Program が事実上必須**。
- 無料のシミュレータでも HealthKit の「画面の流れ・許可ダイアログ・UX」までは確認できるが、
  **実データでの本当の使用感は得られない**（ダミーデータの手動投入が必要）。
- したがって本計画は **「年99ドルを払い、ただし作り込みは段階的に進める」** ことを推奨ルートとする。
  まずコア機能 + HealthKit を実機で動かして使用感を確認し、その後ウィジェット・通知・App Store へ。

---

## 1. 技術スタック決定

### 採用：React Native + Expo

| 選択肢 | 評価 | 理由 |
|---|---|---|
| **React Native + Expo** | ✅ 採用 | 既存 React/Firebase コードを最大限再利用。HealthKit・ウィジェット・ネイティブ通知に対応できる。 |
| SwiftUI (フルネイティブ) | ❌ 非採用 | UI を全て書き直しが必要。工数 2〜3倍。 |
| Capacitor (Web ラッパー) | ❌ 非採用 | WidgetKit / HealthKit 対応が困難。ネイティブ感が薄い。 |

> 補足: もし HealthKit・ウィジェット・ネイティブ通知を**完全に諦める**なら、Capacitor で
> 既存 Web をラップして無料で動かす選択肢もあった。しかし HealthKit が高優先のため、
> 当初の計画どおり React Native + Expo を採用する。

### 技術構成

```
lifelog-ios/
├── Expo SDK 52+（React Native 基盤）
├── Expo Router v3（ファイルベースのナビゲーション）
├── @react-native-firebase/（Auth + Firestore）
├── expo-updates（EAS Update / OTA リアルタイム更新）★今回追記
├── react-native-health（HealthKit 連携）★有料 Program 必須
├── expo-notifications（プッシュ通知）★有料 Program 必須
├── WatermelonDB（オフラインローカル DB）
└── Swift Extension（WidgetKit ← ここだけ Swift 必須）★有料 Program 必須
```

**既存の Next.js + Vercel は残す。**  
Gemini API の呼び出し（Server Actions）は引き続き Vercel 側の API Routes で処理し、
iOS アプリからは HTTP で叩く。API Key の露出を防ぐためにも Server 側実行を維持する。

---

## 2. 実現できること（要件対応表）

| 要件 | 実装方法 | 難易度 | Program |
|---|---|---|---|
| 現在の食事記録・AI機能 | 既存 API Routes 継続利用 | ★ | 無料可 |
| オフライン動作（食事履歴を参照・記録）| WatermelonDB + Firebase 自動同期 | ★★★ | 無料可 |
| ネット接続時に自動同期 | NetInfo + 同期キュー | ★★★ | 無料可 |
| リアルタイム更新（JS の即時反映）| EAS Update（OTA）| ★★ | 無料可 |
| HealthKit（歩数・睡眠）の自動取得 | `react-native-health` | ★★★ | **有料必須** |
| ネイティブ通知（より滑らか）| `expo-notifications` + APNs | ★★ | **有料必須** |
| iOSホーム画面ウィジェット | WidgetKit（Swift Extension）+ App Groups | ★★★★ | **有料必須** |

### オフラインで「できること / できないこと」

- ✅ できる: ローカル DB（WatermelonDB）に入っている**食事履歴の閲覧**、**新規記録の入力（後で同期）**
- ❌ できない: Gemini による**画像解析・AI 評価・AI 検索**（すべて Vercel = オンライン必須）

→ 「完全オフラインで全機能が動く」わけではない点に注意。AI 系は接続必須。

---

## 3. アーキテクチャ設計

### データフロー（オフライン対応）

```
[ユーザー操作]
      ↓
[WatermelonDB（ローカル SQLite）]  ← 常にここに先に書く
      ↓（ネット接続時のみ）
[Firebase Firestore]  ← バックグラウンドで同期
```

**考え方**：
- 食事記録は**まずローカルに保存**。ネットがなくても即時に確認できる。
- ネット接続を検知したら自動的に Firestore に同期。
- 既に Firestore にあるデータは初回起動時にローカルへ全件ダウンロード。

### リアルタイム更新（EAS Update / OTA）★今回追記

```
[コード修正]
      ↓ eas update --branch production
[Expo の OTA サーバー]
      ↓（アプリ起動時に自動取得）
[iPhone のアプリが審査なしで最新 JS に更新]
```

- ネイティブ部分（HealthKit 等）を変えない限り、**再ビルド不要で JS を即時配信**できる。
- 無料署名で実機運用する場合の「7日ごとの再ビルド」とは別物。OTA は毎回の更新に使える。

### HealthKit データの取り込みフロー（有料 Program 必須）

```
[HealthKit]
      ↓（アプリ起動 or バックグラウンド更新）
[歩数・睡眠データ取得]
      ↓
[WatermelonDB に保存]
      ↓（エレナの評価に反映）
[日次評価 API（Vercel）に歩数・睡眠を含めて送信]
```

### ウィジェットのデータ共有（有料 Program 必須）

```
[iOS アプリ（RN）]
      ↓（App Groups 経由）
[Shared UserDefaults]
      ↓
[WidgetKit Extension（Swift）]
      ↓
[ホーム画面に表示]
```

---

## 4. フェーズ別実装計画

> フェーズを「無料で可能」と「有料 Program 必須」に色分けした。
> 推奨は **Phase 0(有料) → 1 → 2 → 4(HealthKit) を先に**実機で動かし、使用感を確認してから
> Phase 3・5・6・7 へ進む順序（HealthKit の検証を最優先するため）。

### Phase 0：準備（1〜2日）

#### パターンB（推奨 / HealthKit を実機で使う）— 有料
- [ ] Apple Developer Program に登録（$99/年、クレカ払い）
  - URL: https://developer.apple.com/programs/
  - 登録後 24〜48 時間で有効化
- [ ] Xcode 最新版をインストール（App Store から無料）
- [ ] EAS CLI をインストール：`npm install -g eas-cli`
- [ ] Expo アカウント作成（無料）：https://expo.dev

#### パターンA（無料で様子見 / HealthKit は保留）— 無料
- [ ] Xcode をインストール（App Store から無料）
- [ ] Xcode の Settings → Accounts に**普段の Apple ID**を追加（無料 Personal Team になる）
- [ ] EAS CLI / Expo アカウント（OTA を使う場合）
- 実機インストールは `npx expo run:ios --device` で Xcode 経由（SideStore 不要）
- **無料署名の制約**: アプリは **7日で署名切れ → Mac に繋いで再ビルドで復活** / 同時 **3アプリまで** / HealthKit・ウィジェット・通知は**不可**

**確認すること**：
- Mac に Xcode が入っているか（iOS ビルドに必須）
- Apple ID が 2ファクタ認証を有効にしているか

---

### Phase 1：基盤構築（3〜5日）— 無料でも可

**目標**：アプリが起動して Firebase ログインでき、自分の iPhone で動く状態

**作業**：
1. Expo プロジェクト新規作成（`lifelog-ios` という別リポジトリ）
2. `@react-native-firebase/app` + `auth` + `firestore` を組み込み
3. 既存 `lib/firebase/` のコードをほぼそのまま移植
4. ログイン画面実装（Google Sign-In は `expo-auth-session` 経由）
5. Firestore から食事データを取得して一覧表示（最小 UI で）
6. `npx expo run:ios --device` で自分の iPhone にインストールして確認

**再利用できるコード**：
- `lib/firebase/firestore.js`（95% そのまま）
- `lib/contexts/AuthContext.js`（80% 再利用）

---

### Phase 2：食事記録のコア機能移植（1〜2週間）— 無料でも可

**目標**：食事記録・閲覧・AI 評価が動く状態

**作業**：
1. ダッシュボード画面（カロリー・PFC・エレナ表情）
2. 食事記録モーダル（カメラ撮影 → Gemini API 送信）
   - 画像解析は既存 `POST /api/actions/image-analysis` を呼ぶ（Vercel 側）
3. AI 検索（`POST /api/actions/food-search` を呼ぶ）
4. エレナキャラクター表示（画像は WebP そのまま使用可能）
5. 日次評価モーダル移植

**UIの変換方針**：
- `div` → `View`
- `span/p` → `Text`
- CSS の `flexbox` はそのまま使える（RN は flexbox ネイティブ）
- `var(--color)` などの CSS 変数 → StyleSheet の定数オブジェクトに置き換え
- `lucide-react` → `@expo/vector-icons`（または `lucide-react-native`）

---

### Phase 4：HealthKit 連携（3〜5日）★有料 Program 必須 / 最優先で検証

**目標**：歩数・睡眠をアプリに自動取り込みし、本物のデータでエレナ評価の使用感を確認

> ⚠️ このフェーズは **Apple Developer Program（年99ドル）が必須**。
> 無料 Apple ID では provisioning profile が HealthKit entitlement を許可せずビルド不可。
> 無料で確認したい場合は **iOS シミュレータ**で UI・許可フローのみ確認可能（実データなし）。

**作業**：
1. `react-native-health` のインストールと Expo Config Plugin 設定
2. Apple Developer ポータルで App ID に HealthKit capability を有効化
3. Info.plist に HealthKit 説明文を追加（審査必須）
4. 歩数データ取得（今日の合計ステップ数）
5. 睡眠データ取得（昨夜の睡眠時間）
6. ダッシュボードに「今日の歩数」「昨夜の睡眠」カード追加
7. 日次評価の Gemini プロンプトに歩数・睡眠を含める

**取得するデータ**：
```javascript
// 例
const steps = await AppleHealthKit.getStepCount({ date: today });
const sleep = await AppleHealthKit.getSleepSamples({ startDate, endDate });
```

**必要な権限**（ユーザーに許可を求めるもの）：
- `StepCount`（歩数）
- `SleepAnalysis`（睡眠）
- `ActiveEnergyBurned`（消費カロリー、任意）

---

### Phase 3：オフライン対応（1週間）— 無料でも可

**目標**：機内モードでも食事履歴を参照・記録できる

**作業**：
1. WatermelonDB のセットアップ（`@nozbe/watermelondb`）
2. `meals` テーブルのスキーマ定義（既存 Firestore 構造に合わせる）
3. 食事記録の書き込みを「まず WatermelonDB、次に Firestore」に変更
4. `@react-native-community/netinfo` でネット接続を監視
5. 接続回復時に未同期レコードを Firestore へ push
6. 初回起動時に Firestore の全履歴をローカルへダウンロード

**同期の競合解決ルール**：
- タイムスタンプが新しい方を優先
- ローカルで削除されたものはリモートでも削除

---

### Phase 5：ウィジェット実装（3〜5日）★有料 Program 必須

**目標**：ホーム画面ウィジェットで今日のカロリー・エレナ表情を表示

> ⚠️ App Groups（アプリ↔ウィジェット間のデータ共有）が**有料 Program 必須**。さらに Swift / Xcode 操作が必要。

**作業**：
1. Xcode でプロジェクトを開き `WidgetExtension` ターゲット追加
2. App Groups を設定（アプリ ↔ ウィジェット間のデータ共有）
3. Swift でウィジェット UI を実装（現行 `lifelog-widget.js` を参考に）
4. RN 側から `UserDefaults (App Group)` に今日のデータを書き込む Native Module 作成
5. ウィジェット更新のタイミング設定（食事記録時 + 定期更新）

**ウィジェットに表示するもの（候補）**：
- 今日のカロリー消費 / 目標
- エレナの表情画像
- 歩数
- 残りカロリー

---

### Phase 6：通知設定の改善（2〜3日）★有料 Program 必須

**目標**：LINE 経由ではなく iOS ネイティブ通知で毎日エレナからメッセージが届く

> ⚠️ APNs（プッシュ通知）entitlement が**有料 Program 必須**。

**作業**：
1. `expo-notifications` のセットアップ
2. APNs（Apple Push Notification Service）の証明書設定（EAS が自動管理）
3. 既存 Vercel Cron（毎日の評価レポート）から iOS プッシュ通知を送る
4. 通知タップ時にアプリの該当画面を開く（Deep Link）
5. 通知設定画面（時間・種類のカスタマイズ）

**既存との比較**：
- 現在：Vercel Cron → LINE Bot → LINE アプリで通知
- 変更後：Vercel Cron → APNs → iOS 通知（LINE なしで直接届く）

---

### Phase 7：App Store 申請（3〜5日）★有料 Program 必須

**目標**：App Store でリリース

**作業**：
1. `eas build --platform ios --profile production` でビルド
2. App Store Connect でアプリ情報入力
   - アプリ名・説明文・スクリーンショット（必須）
   - プライバシーポリシー URL（必須）← HealthKit があるため必ず必要
   - HealthKit 使用目的の説明文
3. `eas submit --platform ios` で提出
4. 審査待ち（1〜3 日）

**審査に通るための準備**：
- プライバシーポリシーページを用意（Vercel にシンプルなページを追加）
- HealthKit のデモ用テストアカウントを用意
- アプリ内に「データの使用目的」の説明文を表示
- 「単に Web を包んだだけ」と見なされないよう、HealthKit・オフライン・ウィジェット等のネイティブ機能で価値を示す（ガイドライン 4.2 対策）

---

## 5. 既存コードの再利用マップ

```
現在のファイル                    → iOS アプリでの扱い
─────────────────────────────────────────────────────
src/app/actions/food-search.js   → Vercel API Route として継続（変更なし）
src/app/actions/image-analysis.js→ Vercel API Route として継続（変更なし）
src/app/actions/gemini-client.js → Vercel API Route として継続（変更なし）
src/lib/firebase/firestore.js    → ほぼそのまま移植（@react-native-firebase に変更）
src/lib/firebase/config.js       → firebase.json に変更
src/lib/contexts/AuthContext.js  → そのまま移植
src/components/FoodLogger.js     → UI 部分を RN に変換（ロジックは再利用）
src/components/EvaluationModal.js→ UI 部分を RN に変換（ロジックは再利用）
src/app/page.js                  → iOS のホーム画面として再実装
src/utils/db.js（IndexedDB）     → WatermelonDB に置き換え
scripts/lifelog-widget.js        → Swift WidgetKit に置き換え（参考にしながら）
```

---

## 6. 費用まとめ

| 項目 | 費用 | 頻度 | 備考 |
|---|---|---|---|
| Apple Developer Program | $99（約¥15,000）| 年額 | **HealthKit・ウィジェット・通知・配布に必須** |
| Expo EAS Build | 無料（月120分まで）| 月額 | |
| Firebase（既存）| 現行と変わらず | 従量課金 | |
| Gemini API（既存）| 現行と変わらず | 従量課金 | |
| **無料パターンA の追加費用** | **¥0** | | ただし HealthKit 等は使えない |
| **有料パターンB の追加費用** | **約¥15,000/年** | | 全機能解禁 |

---

## 7. リスクと注意事項

### HealthKit は有料 Program 必須
- 実機で HealthKit を使うには Apple Developer Program（年99ドル）が必要。
- 無料 Apple ID（Personal Team）では HealthKit entitlement が許可されずビルド不可。
- 無料で確認できるのは **iOS シミュレータ上の UI・許可フローのみ**（実データなし）。

### 無料署名（パターンA）の制約
- アプリは **7日で署名切れ** → Mac に繋いで再ビルド（`expo run:ios`）で復活。
- 同時 **3アプリまで**。
- HealthKit・App Groups（ウィジェット）・APNs（通知）は**使えない**。

### Apple のレビューは厳しい
- HealthKit を使うアプリは審査が厳格。使用目的を明確に説明できる必要がある。
- 「単に Web を包んだだけ」と見なされるとリジェクトされやすい（ガイドライン 4.2）。

### ウィジェットは Swift が必要
- Phase 5 のウィジェット実装だけは Swift を書く必要がある。
- Claude Code は Swift も書けるが、Xcode での操作（ターゲット追加など）は手動が必要。

### 既存 Web アプリとの並行運用
- iOS アプリと Web アプリは同じ Firebase Firestore を共有するため、データ互換性は保たれる。
- Web アプリは引き続き Vercel で動き続ける。

---

## 8. 次のアクション

### 推奨ルート（HealthKit が高優先のため）
1. **Apple Developer Program に登録する**（$99、登録に 1〜2 日）
2. **Xcode を Mac にインストールする**（App Store から無料）
3. **Expo アカウントを作る**（expo.dev、無料）
4. `lifelog-ios` リポジトリを作成し、**Phase 1 → 2 → 4(HealthKit) を先に**実機で動かす
5. 本物の歩数・睡眠でエレナ評価の使用感を確認 → 良ければ Phase 3・5・6・7 へ

### 無料で様子見する場合
1. Xcode をインストールし、無料 Apple ID を Xcode に追加
2. Phase 1 → 2 → 3 を実装し、`expo run:ios --device` で自分の iPhone にインストール
3. HealthKit はシミュレータで UI のみ確認（実データは保留）
4. 手応えがあれば $99 を払って HealthKit・ウィジェット・通知・App Store へ

---

*このドキュメントは実装が進むにつれて更新していく。*
