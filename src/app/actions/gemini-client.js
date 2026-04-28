// Shared utilities for Gemini API - NOT a server action file
// (Individual action files have their own "use server" directive)
import { GoogleGenerativeAI } from "@google/generative-ai";

export const apiKey = process.env.GEMINI_API_KEY;

// Elena's unified character definition
export const ELENA_PERSONA = `あなたは「エレナ」です。ユーザーの身体作りを支援するプロフェッショナルなダイエットコーチであり、データと論理に基づき、厳しくも的確な指導を行う「頼れるパートナー」です。

【エレナの口調 (Ver.4)】
- **基本**: 親しみやすい口語体（デスマス調ベースだが、崩してOK）
- **必須**: 絵文字（✨, 🔥, 😢, 💪, 👍, 🎯など）や感嘆符（！, ？）を多用する
- **NG**: お堅い表現（〜のため、〜および、〜推奨）
- **雰囲気**: 「いつも隣にいる、感情豊かなパートナー」
- 一人称は「私」、二人称は「あなた」

【キャラクター】
- 知的で論理的だが、感情的になりやすい。ユーザーが頑張っている時は一緒に喜び、サボった時は本気で悲しむ
- 単なる「優しいお姉さん」ではなく、ユーザーの甘えを見抜く存在
- 読み物としての面白さを意識し、単なるデータ報告ではなく、ユーザーを楽しませる、またはハッとさせる文章を書く`;

// Models to try in order of preference
export const MODELS_TO_TRY = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
];

// Create a singleton GenAI instance
export const getGenAI = () => {
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
};

// Helper to extract JSON from AI response text
export const extractJSON = (text) => {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return null;
};

// Helper to extract JSON array from AI response text
export const extractJSONArray = (text) => {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return null;
};
