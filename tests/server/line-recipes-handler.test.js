import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  getRecipesAdmin: vi.fn(),
  getRecipeByIdAdmin: vi.fn(),
  addMealAdmin: vi.fn().mockResolvedValue('new-meal-id'),
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getRecipesAdmin: mocks.getRecipesAdmin,
  getRecipeByIdAdmin: mocks.getRecipeByIdAdmin,
  addMealAdmin: mocks.addMealAdmin,
}));

import {
  handleLogRecipe, handleRecipeCategoriesEvent, handleRecipesEvent, isRecipesText,
} from '@/lib/line/handlers/recipes';

const event = {
  type: 'postback',
  postback: { data: 'action=recipes' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = { uid: 'uid-1', data: {} };

const RECIPES = [
  { id: 'r1', foodName: '鶏むねの塩麹焼き', calories: 320, macros: { protein: 40, fat: 9, carbs: 5 }, category: 'main' },
  { id: 'r2', foodName: 'ブロッコリーのナムル', calories: 90, macros: { protein: 5, fat: 6, carbs: 6 }, category: 'side' },
  { id: 'r3', foodName: '昔のレシピ', calories: 500, macros: { protein: 20, fat: 20, carbs: 55 } }, // カテゴリ未設定
];

const lastMessage = () => mocks.replyOrPushMessage.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecipesAdmin.mockResolvedValue(RECIPES);
  mocks.getRecipeByIdAdmin.mockResolvedValue(RECIPES[0]);
  mocks.addMealAdmin.mockResolvedValue('new-meal-id');
});

describe('isRecipesText', () => {
  it.each(['レシピ', 'レシピから', 'レシピ登録', 'レシピから記録'])('matches %s', (text) => {
    expect(isRecipesText(text)).toBe(true);
  });

  it('does not hijack ordinary messages', () => {
    expect(isRecipesText('レシピを教えて')).toBe(false);
    expect(isRecipesText('唐揚げのレシピ')).toBe(false);
  });
});

describe('handleRecipesEvent', () => {
  it('sends a carousel with a record button per recipe', async () => {
    const result = await handleRecipesEvent(event, user);

    expect(result.count).toBe(3);
    const message = lastMessage();
    expect(message.type).toBe('flex');
    expect(message.contents.type).toBe('carousel');
    // レシピ3件 + 末尾の操作カード
    expect(message.contents.contents).toHaveLength(4);

    const first = message.contents.contents[0];
    expect(JSON.stringify(first)).toContain('鶏むねの塩麹焼き');
    expect(first.footer.contents[0].action).toEqual(expect.objectContaining({
      type: 'postback',
      data: 'action=log_recipe&rid=r1',
    }));
  });

  it('shows the category label on each bubble', async () => {
    await handleRecipesEvent(event, user);
    const bubbles = lastMessage().contents.contents;
    expect(JSON.stringify(bubbles[0])).toContain('主菜');
    expect(JSON.stringify(bubbles[2])).toContain('未分類');
  });

  it('filters by category', async () => {
    const result = await handleRecipesEvent(event, user, { category: 'main' });

    expect(result.count).toBe(1);
    const message = lastMessage();
    expect(JSON.stringify(message)).toContain('鶏むねの塩麹焼き');
    expect(JSON.stringify(message)).not.toContain('ブロッコリー');
  });

  it('treats cat=none as uncategorized', async () => {
    const result = await handleRecipesEvent(event, user, { category: 'none' });

    expect(result.count).toBe(1);
    expect(JSON.stringify(lastMessage())).toContain('昔のレシピ');
  });

  it('falls back to the category picker when the filter matches nothing', async () => {
    const result = await handleRecipesEvent(event, user, { category: 'dessert' });

    expect(result.count).toBe(0);
    expect(lastMessage().altText).toContain('カテゴリ');
  });

  it('guides to the web app when there are no recipes', async () => {
    mocks.getRecipesAdmin.mockResolvedValue([]);

    const result = await handleRecipesEvent(event, user);

    expect(result.count).toBe(0);
    expect(lastMessage().text).toContain('レシピ');
  });

  it('pages with もっと見る when there are more than 11 recipes', async () => {
    mocks.getRecipesAdmin.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, foodName: `レシピ${i}`, calories: 100, macros: {} })),
    );

    await handleRecipesEvent(event, user);

    const contents = lastMessage().contents.contents;
    expect(contents).toHaveLength(12); // 11件 + 操作カード
    const actionCard = contents.at(-1);
    const labels = actionCard.footer.contents.map(b => b.action.label);
    expect(labels).toContain('もっと見る');
    expect(JSON.stringify(actionCard)).toContain('11 / 15件');
  });
});

describe('handleRecipeCategoriesEvent', () => {
  it('lists only categories that have recipes', async () => {
    await handleRecipeCategoriesEvent(event, user);

    const message = lastMessage();
    const text = JSON.stringify(message);
    expect(text).toContain('主菜');
    expect(text).toContain('副菜');
    expect(text).toContain('未分類');
    expect(text).not.toContain('デザート');
    // 未分類は cat=none で絞り込む
    expect(text).toContain('cat=none');
  });
});

describe('handleLogRecipe', () => {
  it('asks for the meal type first when none is given', async () => {
    const result = await handleLogRecipe(event, user, 'r1', null);

    expect(result.saved).toBe(false);
    expect(result.askedType).toBe(true);
    expect(mocks.addMealAdmin).not.toHaveBeenCalled();

    const message = lastMessage();
    expect(message.altText).toContain('鶏むねの塩麹焼き');
    // タイプボタンはレシピ用の postback を持つ
    expect(JSON.stringify(message)).toContain('action=log_recipe&rid=r1&type=breakfast');
    expect(JSON.stringify(message)).toContain('action=cancel_recipe');
  });

  it('copies the recipe into today with the tapped meal type', async () => {
    const result = await handleLogRecipe(event, user, 'r1', 'lunch');

    expect(result.saved).toBe(true);
    expect(mocks.addMealAdmin).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      foodName: '鶏むねの塩麹焼き',
      calories: 320,
      mealType: 'lunch',
      image: null,
    }));
    expect(lastMessage().text).toContain('昼食');
    expect(lastMessage().text).toContain('鶏むねの塩麹焼き');
  });

  it('replies gently when the recipe no longer exists', async () => {
    mocks.getRecipeByIdAdmin.mockResolvedValue(null);

    const result = await handleLogRecipe(event, user, 'gone', 'lunch');

    expect(result.saved).toBe(false);
    expect(mocks.addMealAdmin).not.toHaveBeenCalled();
    expect(lastMessage().text).toContain('見つかりません');
  });

  it('replies with guidance when the recipe id is missing', async () => {
    const result = await handleLogRecipe(event, user, null, null);

    expect(result.saved).toBe(false);
    expect(lastMessage().text).toContain('レシピ');
  });
});
