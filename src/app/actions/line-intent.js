"use server";
import { SchemaType } from "@google/generative-ai";
import {
    apiKey, getGenAI, MODELS_TO_TRY, THINKING, createModel
} from "./gemini-client";

const LINE_INTENT_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        intent: { type: SchemaType.STRING, enum: ["log_meal", "other"] },
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
- intent="other": 雑談、相談、挨拶、体重以外の数値、意味不明な発話

log_meal の場合、mealDescription には記録対象の食事内容だけを自然な日本語で入れてください。
other の場合、mealDescription は null にしてください。
    `.trim();

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, LINE_INTENT_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const data = JSON.parse(result.response.text());
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
