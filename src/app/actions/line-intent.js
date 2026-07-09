"use server";
import { SchemaType } from "@google/generative-ai";
import {
    apiKey, getGenAI, MODELS_TO_TRY, THINKING, createModel
} from "./gemini-client";

const LINE_INTENT_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        intent: { type: SchemaType.STRING, enum: ["log_meal", "edit_record", "other"] },
        mealDescription: { type: SchemaType.STRING, nullable: true },
    },
    required: ["intent", "mealDescription"],
};

export const classifyLineIntent = async (text) => {
    if (!apiKey) {
        return { intent: "other", mealDescription: null, error: "API Key missing" };
    }

    const genAI = getGenAI();
    const prompt = `
あなたはLINEで届いたユーザー発話を分類する軽量ルーターです。

発話: 「${text}」

分類:
- intent="log_meal": 食べたもの・飲んだものを記録したい発話。例: 「カレー食べた」「サラダチキンとおにぎり」「昼は牛丼」
- intent="edit_record": すでに保存済みの食事記録を削除・取消・変更したい発話。例: 「さっきのチョコレートを削除して」「間違えて2回記録したカレー1個消して」「今日の朝食を全部昼食にして」「夕食のタイプを変えて」
- intent="other": 雑談、相談、挨拶、体重以外の数値、意味不明な発話、食事の願望・気分。例: 「唐揚げ食べたい」「今日はラーメンの気分」「お腹すいた」

削除・消す・取消・変更・朝食/昼食/夕食/間食にして、など既存記録への操作キーワードがある場合は edit_record を優先してください。
log_meal は新しい食事を追加する発話だけです。判断に迷う場合、新規追加を優先しないでください。
「食べたい」「〜の気分」「お腹すいた」など、まだ食べていない願望や体調・気分の発話は log_meal ではなく other にしてください。
例: 「唐揚げ食べたい」→ other / 「唐揚げ食べた」→ log_meal

log_meal の場合、mealDescription には記録対象の食事内容だけを自然な日本語で入れてください。
edit_record の場合、mealDescription は null にしてください。
other の場合、mealDescription は null にしてください。
    `.trim();

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, LINE_INTENT_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const data = JSON.parse(result.response.text());
            if (data.intent === "edit_record") {
                return { intent: "edit_record", mealDescription: null };
            }
            if (data.intent === "log_meal") {
                return {
                    intent: "log_meal",
                    mealDescription: data.mealDescription || text,
                };
            }
            return { intent: "other", mealDescription: null };
        } catch (e) {
            console.warn(`Line intent model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { intent: "other", mealDescription: null, error: lastError?.message || "Intent classification failed" };
};
