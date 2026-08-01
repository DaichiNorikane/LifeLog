/**
 * HealthKit 由来の指標の定義（唯一の真実）
 *
 * ここに1件追加すると、以下すべてに自動反映される:
 *   - 受信API のバリデーション (src/lib/health/ingest.js)
 *   - ダッシュボードのアクティビティカード (src/components/ActivityCard.js)
 *
 * 【重要】値は必ず `number | null`。
 *   null = HealthKit から取れなかった / 0 = 実際にゼロ。この2つは絶対に混同しない。
 *   歩数 0 歩の日と、同期に失敗した日は、まったく違う意味を持つ。
 *
 * min/max:
 *   HealthKit は iPhone・Apple Watch・サードパーティアプリが混在するため、
 *   まれに桁違いの値が入る。範囲外は 400 で弾かず null にする
 *   （取れているほかの指標まで巻き添えで捨てないため）。
 *
 * primary:
 *   true … カードの一等地に出す。false … 「詳しく」を開いたときだけ出す
 */

/** users/{uid}/activityLogs/{YYYY-MM-DD} に入る日次アクティビティ */
export const ACTIVITY_METRICS = [
    // --- 動いた量 ---
    {
        key: 'steps', label: '歩数', unit: '歩', decimals: 0,
        min: 0, max: 200000, primary: true,
        healthKitName: '歩数', aggregate: 'sum',
    },
    {
        key: 'activeEnergy', label: 'アクティブ', unit: 'kcal', decimals: 0,
        min: 0, max: 10000, primary: true,
        healthKitName: 'アクティブエネルギー', aggregate: 'sum',
    },
    {
        key: 'distanceKm', label: '移動距離', unit: 'km', decimals: 2,
        min: 0, max: 300, primary: true,
        healthKitName: 'ウォーキング＋ランニングの距離', aggregate: 'sum',
    },
    {
        key: 'exerciseMinutes', label: '運動時間', unit: '分', decimals: 0,
        min: 0, max: 1440, primary: true,
        healthKitName: 'エクササイズ時間', aggregate: 'sum',
    },
    {
        key: 'flightsClimbed', label: '上った階数', unit: '階', decimals: 0,
        min: 0, max: 1000, primary: false,
        healthKitName: '上った階数', aggregate: 'sum',
    },
    {
        key: 'standHours', label: 'スタンド', unit: '時間', decimals: 0,
        min: 0, max: 24, primary: false,
        healthKitName: 'スタンド時間', aggregate: 'sum',
    },
    {
        key: 'basalEnergy', label: '安静時消費', unit: 'kcal', decimals: 0,
        min: 0, max: 6000, primary: false,
        healthKitName: '安静時消費エネルギー', aggregate: 'sum',
    },

    // --- からだの状態 ---
    {
        key: 'restingHeartRate', label: '安静時心拍', unit: 'bpm', decimals: 0,
        min: 25, max: 200, primary: false,
        healthKitName: '安静時心拍数', aggregate: 'latest',
    },
    {
        key: 'heartRate', label: '心拍数', unit: 'bpm', decimals: 0,
        min: 25, max: 250, primary: false,
        healthKitName: '心拍数', aggregate: 'latest',
    },
    {
        key: 'hrv', label: '心拍変動', unit: 'ms', decimals: 0,
        min: 1, max: 500, primary: false,
        healthKitName: '心拍変動', aggregate: 'latest',
    },

    // --- 歩き方（iPhone を持ち歩くだけで貯まる。運動の質の手がかりになる）---
    {
        key: 'walkingSpeed', label: '歩行速度', unit: 'km/h', decimals: 1,
        min: 0, max: 30, primary: false,
        healthKitName: '歩行速度', aggregate: 'avg',
    },
    {
        key: 'stepLength', label: '歩幅', unit: 'cm', decimals: 0,
        min: 0, max: 200, primary: false,
        healthKitName: '歩幅', aggregate: 'avg',
    },
    {
        key: 'walkingAsymmetry', label: '歩行非対称性', unit: '%', decimals: 1,
        min: 0, max: 100, primary: false,
        healthKitName: '歩行非対称性', aggregate: 'avg',
    },
    {
        key: 'doubleSupportPercentage', label: '両脚支持時間', unit: '%', decimals: 1,
        min: 0, max: 100, primary: false,
        healthKitName: '歩行両脚支持時間', aggregate: 'avg',
    },
];

/**
 * users/{uid}/weights/{YYYY-MM-DD} に入る体組成。
 * eufy（Anker）の体組成計 → EufyLife → Apple ヘルスケア → ここ、という経路で届く。
 *
 * 【注意】HealthKit には「筋肉量」「体水分率」「内臓脂肪」に相当する型が存在しない。
 * 体組成計のアプリ側にそれらの表示があっても、ヘルスケア経由では取得できない。
 * ヘルスケアから取れる体組成は、実質この5つで全部。
 */
export const BODY_METRICS = [
    {
        key: 'weight', label: '体重', unit: 'kg', decimals: 1,
        min: 10, max: 500, primary: true, healthKitName: '体重',
    },
    // min は 0 にしてある。0 は「実際にゼロ」として通し、
    // 上限だけで明らかな異常値を弾く（null と 0 を混同しないという原則を優先）
    {
        key: 'bodyFat', label: '体脂肪率', unit: '%', decimals: 1,
        min: 0, max: 75, primary: true, healthKitName: '体脂肪率',
    },
    {
        key: 'leanBodyMass', label: '除脂肪体重', unit: 'kg', decimals: 1,
        min: 0, max: 300, primary: true, healthKitName: '除脂肪体重（LBM）',
    },
    {
        key: 'bmi', label: 'BMI', unit: '', decimals: 1,
        min: 0, max: 100, primary: true, healthKitName: 'ボディマス指数（BMI）',
    },
    {
        key: 'height', label: '身長', unit: 'cm', decimals: 0,
        min: 0, max: 250, primary: false, healthKitName: '身長',
    },
];

const toMap = (list) => list.reduce((acc, m) => { acc[m.key] = m; return acc; }, {});

export const ACTIVITY_METRIC_MAP = toMap(ACTIVITY_METRICS);
export const BODY_METRIC_MAP = toMap(BODY_METRICS);

/** 表示用に丸める。null はそのまま null（呼び出し側で「―」を出す） */
export const roundMetric = (key, value) => {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const meta = ACTIVITY_METRIC_MAP[key] || BODY_METRIC_MAP[key];
    const decimals = meta?.decimals ?? 1;
    const factor = 10 ** decimals;
    return Math.round(number * factor) / factor;
};

/** 「8,421」のように3桁区切りで表示する（歩数・kcal が読みづらいため） */
export const formatMetric = (key, value) => {
    const rounded = roundMetric(key, value);
    if (rounded === null) return '―';
    const meta = ACTIVITY_METRIC_MAP[key] || BODY_METRIC_MAP[key];
    return rounded.toLocaleString('ja-JP', {
        minimumFractionDigits: meta?.decimals ?? 0,
        maximumFractionDigits: meta?.decimals ?? 0,
    });
};

/**
 * 体脂肪量 (kg)。体組成計は体脂肪「率」しか送ってこないが、
 * 減量で本当に見たいのは「脂肪が何kg減ったか」なので、ここで導出する。
 *
 * 保存はしない（体重だけ手入力で上書きされた時に古い値が残るため）。表示のたびに計算する。
 */
export const calcFatMass = (weight, bodyFatPercent) => {
    // Number(null) は 0 になる。片方が未計測の日に「体脂肪 0kg」と出すのは
    // null と 0 を混同する典型例なので、数値化の前に弾く
    if (weight === null || weight === undefined) return null;
    if (bodyFatPercent === null || bodyFatPercent === undefined) return null;

    const w = Number(weight);
    const bf = Number(bodyFatPercent);
    if (!Number.isFinite(w) || !Number.isFinite(bf)) return null;
    if (w <= 0 || bf < 0) return null;
    return Math.round(w * bf) / 100;
};

/**
 * 体脂肪率の正規化。
 * ショートカットの「ヘルスケアサンプルを検索」は、体脂肪率を
 * 25.8（%）で返すこともあれば 0.258（比率）で返すこともある。
 * 人体で 1% 未満はありえないので、1 以下なら比率とみなして100倍する。
 */
export const normalizeBodyFatPercent = (value) => {
    if (value === null || value === undefined) return null;
    // ショートカットは値が取れない日に空文字を送ってくる。Number('') は 0 になるので先に弾く
    if (typeof value === 'string' && value.trim() === '') return null;

    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number > 0 && number <= 1) return Math.round(number * 1000) / 10;
    return number;
};
