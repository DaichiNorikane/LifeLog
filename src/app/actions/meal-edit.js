"use server";

import { SchemaType } from "@google/generative-ai";
import {
    apiKey,
    getGenAI,
    MODELS_TO_TRY,
    THINKING,
    createModel,
} from "./gemini-client";

const MEAL_EDIT_PLAN_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        operation: { type: SchemaType.STRING, enum: ["delete", "change_type", "none"] },
        mealType: { type: SchemaType.STRING, enum: ["breakfast", "lunch", "dinner", "snack"], nullable: true },
        targetIds: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        confirmText: { type: SchemaType.STRING },
        notFoundReason: { type: SchemaType.STRING, nullable: true },
    },
    required: ["operation", "mealType", "targetIds", "confirmText", "notFoundReason"],
};

const formatMealList = (meals = []) => meals.map((meal, index) => (
    `${index + 1}. id=${meal.id} | ${meal.jstDateTime || '日時不明'} | ${meal.foodName || '不明'} | type=${meal.mealType || 'snack'} | ${meal.calories ?? 0}kcal`
)).join('\n');

export const resolveMealEditPlan = async (userText, meals = []) => {
    if (!apiKey) {
        return {
            operation: "none",
            mealType: null,
            targetIds: [],
            confirmText: "",
            notFoundReason: "ごめん、今は記録の変更を考えられないみたい😢 少ししてからもう一度お願い！",
        };
    }

    const genAI = getGenAI();
    const prompt = `
あなたはLINEで届いた「保存済み食事記録の編集依頼」を、対象食事と操作に分解するルーターです。

【ユーザー発話】
${String(userText || '').trim()}

【編集可能な食事一覧】
${formatMealList(meals) || 'なし'}

【操作ルール】
- 削除、消して、取り消し、間違えて2回、1個消して → operation="delete"
- 朝食/昼食/夕食/間食にして、タイプを変えて → operation="change_type"
- 変更先 mealType は breakfast/lunch/dinner/snack のみ。
- 「今日」「さっき」「さっきの」は jstDateTime を根拠に解釈してください。より新しい記録ほど「さっき」に近いです。
- 「全部」「全て」「今日の朝食を全部」などは複数件を targetIds に入れてください。
- targetIds は必ず上の食事一覧に存在する id だけにしてください。捏造は禁止。
- 対象が曖昧、存在しない、操作不能なら operation="none"、targetIds=[]、notFoundReason にエレナ口調の理由を入れてください。
- confirmText は「チョコレート(間食/145kcal)を削除」「朝食3件を昼食に変更」のように、人間向けに短く説明してください。
    `.trim();

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, MEAL_EDIT_PLAN_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const data = JSON.parse(result.response.text());
            return {
                operation: data.operation || "none",
                mealType: data.mealType || null,
                targetIds: Array.isArray(data.targetIds) ? data.targetIds : [],
                confirmText: data.confirmText || "",
                notFoundReason: data.notFoundReason || null,
            };
        } catch (e) {
            console.warn(`Meal edit model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return {
        operation: "none",
        mealType: null,
        targetIds: [],
        confirmText: "",
        notFoundReason: `ごめん、変更内容をうまく読み取れなかった…😢 もう少し具体的に言ってくれる？（${lastError?.message || 'AI失敗'}）`,
    };
};
