# eufy体組成計データをLifelogへ自動送信する設定手順

> **これから設定する場合は `docs/healthkit-activity-setup.md` を見てください。**
> 体組成に加えて歩数・消費カロリー・睡眠まで、**1つのショートカット**で送れます。
> このページは、体組成だけを送る従来の手順です（引き続き動作します）。

この手順では、EufyLifeアプリでApple Health連携を有効にし、iPhoneのショートカットからLifelogへ体重・体脂肪率・BMI・除脂肪体重を送ります。

## 1. EufyLifeとApple Healthを連携する

1. iPhoneでEufyLifeアプリを開きます。
2. 「アカウント」を開きます。
3. 「サードパーティサービス」を開きます。
4. 「ヘルスケア」を選び、Apple Health連携をオンにします。
5. 連携項目で、少なくとも次を許可します。
   - 体重
   - 体脂肪率
   - BMI
   - 除脂肪体重

## 2. iOSショートカットを作成する

事前に、次の2つを用意してください。

- `uid`: FirebaseのユーザーID
- `x-widget-token`: Lifelogの `WIDGET_TOKEN`

この2つは、Scriptableウィジェット `scripts/lifelog-widget.js` の設定で使っている `USER_ID` と `WIDGET_TOKEN` と同じ値です。

1. iPhoneで「ショートカット」アプリを開き、「+」で新しいショートカットを作ります。
2. アクション「ヘルスケアサンプルを検索」を追加します。
3. 検索対象を「体重」にし、条件を「今日」、並び順を「開始日」「最新順」、制限を「1件」にします。
4. アクション「if」を追加し、体重の検索結果がある場合だけ後続の処理を実行するようにします。
5. 同じように、アクション「ヘルスケアサンプルを検索」で次の項目も「今日」「最新1件」で取得します。
   - 体脂肪率
   - BMI
   - 除脂肪体重
6. アクション「URL」を追加し、次のURLを入力します。

```text
https://<デプロイURL>/api/health/weight
```

7. アクション「URLの内容を取得」を追加し、次のように設定します。
   - 方法: `POST`
   - ヘッダー: `x-widget-token` に `WIDGET_TOKEN` の値を入れる
   - 本文を要求: `JSON`
   - JSON本文:

```json
{
  "uid": "FirebaseのユーザーID",
  "weight": "体重の値",
  "bodyFat": "体脂肪率の値",
  "bmi": "BMIの値",
  "leanBodyMass": "除脂肪体重の値",
  "height": "身長の値"
}
```

体脂肪率・BMI・除脂肪体重が取得できない日は、空のままでも問題ありません。Lifelog側では未取得として保存されます。`measuredAt` は省略できます。省略した場合は、送信した時刻が記録時刻になります。

## 3. 毎日自動で実行する

1. 「ショートカット」アプリで「オートメーション」を開きます。
2. 「個人用オートメーション」を作成します。
3. 「時刻」を選び、毎日実行する時刻を設定します。例: 昼12時。
4. 実行するショートカットとして、手順2で作成したショートカットを選びます。
5. 「確認後に実行」をオフにします。表示が「すぐに実行」になっていれば、自動実行されます。

## uidとWIDGET_TOKENの確認方法

Scriptableウィジェットを設定済みの場合は、`scripts/lifelog-widget.js` の先頭にある設定を確認してください。

```js
const CONFIG = {
    API_URL: "https://あなたのドメイン.vercel.app/api/widget/calories",
    WIDGET_TOKEN: "ここにWIDGET_TOKENを設定",
    USER_ID: "ここにFirebaseのUIDを設定",
};
```

ショートカットでは、`USER_ID` と同じ値を `uid` に、`WIDGET_TOKEN` と同じ値を `x-widget-token` ヘッダーに入れます。
