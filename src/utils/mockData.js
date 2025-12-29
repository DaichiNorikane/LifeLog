// Diverse mock database for demo purposes (Japanese Localization)
export const mockDatabase = [
    {
        foodName: "横浜家系ラーメン",
        calories: 850,
        macros: { protein: 42, fat: 55, carbs: 70 },
        breakdown: ["豚骨醤油スープ", "チャーシュー (3枚)", "ほうれん草", "海苔 (大判)"],
        reasoning: "画像から、濃厚で白濁した豚骨醤油スープ（家系特有）が確認できます。トッピングにはほうれん草と大判の海苔、厚切りのチャーシューが見られ、これらは典型的な家系ラーメンの特徴と一致します。スープの粘度と油膜から、脂質が高めであると推測し、カロリーを850kcalと算出しました。"
    },
    {
        foodName: "イタリアンホームパーティーセット",
        calories: 1150,
        macros: { protein: 45, fat: 55, carbs: 120 },
        breakdown: ["マルゲリータピザ (1/2枚)", "クリームニョッキ (1人前)", "カプレーゼ (取り分け)", "白ワイン (1杯)"],
        reasoning: "テーブル上に複数の料理（ピザ、ニョッキ、カプレーゼ）が配置されており、シェアして食べる形式（ホームパーティー）と推論されます。これは2名分の量に見えますが、ユーザー1名分の摂取量として、全体の約50%（ピザ半分、ニョッキ1皿、サラダ等）を計算対象としました。ピザの耳の焼き色やニョッキのソースの質感から、自家製または本格的なイタリアンであると分析し、リッチなクリームソースやお酒のカロリーも加味しています。"
    },
    {
        foodName: "チキンシーザーサラダ",
        calories: 420,
        macros: { protein: 35, fat: 28, carbs: 12 },
        breakdown: ["グリルチキン", "ロメインレタス", "パルメザンチーズ", "シーザードレッシング"],
        reasoning: "鮮やかな緑色の葉野菜はロメインレタスと識別。表面に焦げ目のあるタンパク質源はグリルチキンです。全体に絡まる白いドレッシングと粉チーズの分布から、シーザーサラダであると断定しました。ドレッシングの脂質を考慮してカロリーを算出しています。"
    },
    {
        foodName: "カツカレー",
        calories: 980,
        macros: { protein: 35, fat: 45, carbs: 110 },
        breakdown: ["ロースカツ", "欧風カレーソース", "ご飯 (200g)", "福神漬け"],
        reasoning: "ご飯の上にかけられた褐色のルーと、黄金色に揚げられたカツの特徴的な形状からカツカレーと判定。ルーの色味から欧風カレーのコク（脂質）を推測。ご飯の盛り具合から標準的な200g程度と見積もりました。"
    },
    {
        foodName: "アボカドトースト＆ポーチドエッグ",
        calories: 520,
        macros: { protein: 18, fat: 32, carbs: 45 },
        breakdown: ["サワードウブレッド", "アボカド (1/2個)", "ポーチドエッグ", "チリフレーク"],
        reasoning: "気泡のあるパンの断面からサワードウブレッドと識別。緑色のペーストはアボカド。卵の白身の凝固状態からポーチドエッグと判断しました。ヘルシーながらも脂質（アボカド）が含まれるため、520kcalと評価しています。"
    }
];

export const getMockResult = (file) => {
    // Use file size to deterministically select a result
    const index = file.size % mockDatabase.length;
    console.log(`Mocking analysis for file size ${file.size}. Selected index: ${index}`);
    return {
        ...mockDatabase[index],
        confidence: 0.9 + (Math.random() * 0.09) // Randomize confidence slightly
    };
};
