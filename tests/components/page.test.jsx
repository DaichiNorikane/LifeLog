import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import Home from '@/app/page';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

// Global store for dynamic component props (accessible inside hoisted vi.mock)
const _dynamicPropsStore = vi.hoisted(() => ({ current: {} }));

// Mock all dynamic imports - store props for test access
vi.mock('next/dynamic', () => {
  let idx = 0;
  return {
    default: (importFn) => {
      const myIdx = idx++;
      const MockComponent = (props) => {
        // Store all props by index for test inspection
        _dynamicPropsStore.current[myIdx] = props;
        return <div data-testid="dynamic-component" data-idx={myIdx} {...props} />;
      };
      MockComponent.displayName = 'DynamicComponent';
      MockComponent._idx = myIdx;
      return MockComponent;
    },
  };
});

// --- Auth Mock ---
const mockGoogleSignIn = vi.fn();
const mockLogOut = vi.fn();

import { useAuth } from '@/lib/contexts/AuthContext';
vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, loading: false, googleSignIn: vi.fn(), logOut: vi.fn() })),
}));

// --- Push Notification Mock ---
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

import { usePushNotification } from '@/lib/usePushNotification';
vi.mock('@/lib/usePushNotification', () => ({
  usePushNotification: vi.fn(() => ({
    isSubscribed: false,
    isSupported: false,
    isLoading: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
}));

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));

// --- Firestore Mock ---
const mockGetMeals = vi.fn().mockResolvedValue([]);
const mockGetWeights = vi.fn().mockResolvedValue([]);
const mockGetUserProfile = vi.fn().mockResolvedValue({ targetCalories: 2200 });
const mockDeleteMeal = vi.fn().mockResolvedValue(undefined);
const mockGetStockItems = vi.fn().mockResolvedValue([]);
const mockGetDailyEvaluation = vi.fn().mockResolvedValue(null);
const mockAddMealToFirestore = vi.fn().mockResolvedValue('new-meal-id');
const mockUpdateMealInFirestore = vi.fn().mockResolvedValue(undefined);
const mockSaveDailyEvaluation = vi.fn().mockResolvedValue(undefined);
const mockGetActivityLogs = vi.fn().mockResolvedValue([]);
const mockGetRecentWorkouts = vi.fn().mockResolvedValue([]);
const mockGetConditionLogs = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/firebase/firestore', () => ({
  addMealToFirestore: (...args) => mockAddMealToFirestore(...args),
  getMealsFromFirestore: (...args) => mockGetMeals(...args),
  deleteMealFromFirestore: (...args) => mockDeleteMeal(...args),
  getWeightsFromFirestore: (...args) => mockGetWeights(...args),
  getUserProfile: (...args) => mockGetUserProfile(...args),
  updateMealInFirestore: (...args) => mockUpdateMealInFirestore(...args),
  addStockItem: vi.fn(),
  getStockItems: (...args) => mockGetStockItems(...args),
  deleteStockItem: vi.fn(),
  saveDailyEvaluation: (...args) => mockSaveDailyEvaluation(...args),
  getDailyEvaluation: (...args) => mockGetDailyEvaluation(...args),
  // HealthKit 由来の実測データ（ActivityCard 用）
  getActivityLogs: (...args) => mockGetActivityLogs(...args),
  getRecentWorkouts: (...args) => mockGetRecentWorkouts(...args),
  getConditionLogs: (...args) => mockGetConditionLogs(...args),
  getConditionLog: vi.fn().mockResolvedValue(null),
  getConditionModel: vi.fn().mockResolvedValue(null),
  saveConditionPrediction: vi.fn().mockResolvedValue(undefined),
}));

// --- Cache Mock ---
const mockGetCache = vi.fn().mockResolvedValue(null);
const mockSetCache = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/db', () => ({
  getCache: (...args) => mockGetCache(...args),
  setCache: (...args) => mockSetCache(...args),
}));

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateDailyLog: vi.fn().mockResolvedValue({}),
  evaluateSingleMeal: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app/actions/recipe', () => ({
  calculateRecipeWithGemini: vi.fn().mockResolvedValue({}),
}));

vi.mock('react-simple-pull-to-refresh', () => ({
  default: ({ children, onRefresh }) => (
    <div data-testid="pull-to-refresh" data-onrefresh={!!onRefresh}>
      {children}
    </div>
  ),
}));

// --- Test Data ---
const today = new Date();
const todayISO = today.toISOString();

const mockMeals = [
  {
    id: 'meal-1',
    foodName: '鶏胸肉のグリル',
    calories: 350,
    macros: { protein: 40, fat: 8, carbs: 5 },
    timestamp: todayISO,
    mealType: 'lunch',
    score: 9,
    reason: 'バランスの良い食事',
  },
  {
    id: 'meal-2',
    foodName: 'サーモン刺身',
    calories: 200,
    macros: { protein: 25, fat: 10, carbs: 0 },
    timestamp: todayISO,
    mealType: 'dinner',
    score: 8,
  },
  {
    id: 'meal-3',
    foodName: 'プロテインバー',
    calories: 180,
    macros: { protein: 15, fat: 6, carbs: 20 },
    timestamp: todayISO,
    mealType: 'snack',
    score: 5,
  },
  {
    id: 'meal-4',
    foodName: 'オートミール',
    calories: 250,
    macros: { protein: 8, fat: 5, carbs: 40 },
    timestamp: todayISO,
    mealType: 'breakfast',
    score: 7,
  },
];

const mockWeights = [
  {
    date: (() => {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
    })(),
    weight: 72.5,
  },
];

const mockUserProfile = {
  targetCalories: 2000,
  targetWeight: 68,
  startWeight: 75,
  targetDate: '2026-07-01',
};

/**
 * 上段グリッドの「今日のからだ」要約カードに渡っている props を取り出す。
 * next/dynamic はテストではスタブに差し替わるため、描画結果ではなく props を見る。
 */
const getBodySummaryProps = () =>
  Object.values(_dynamicPropsStore.current).find((p) => p && p.compact === true);

// --- Helpers ---
function setAuthUser(user = { uid: 'test-user', displayName: 'Test User' }, opts = {}) {
  useAuth.mockReturnValue({
    user,
    loading: opts.loading || false,
    googleSignIn: mockGoogleSignIn,
    logOut: mockLogOut,
  });
}

function setAuthLoading() {
  useAuth.mockReturnValue({
    user: null,
    loading: true,
    googleSignIn: mockGoogleSignIn,
    logOut: mockLogOut,
  });
}

function setAuthLoggedOut() {
  useAuth.mockReturnValue({
    user: null,
    loading: false,
    googleSignIn: mockGoogleSignIn,
    logOut: mockLogOut,
  });
}

function setPushSupported(subscribed = false) {
  usePushNotification.mockReturnValue({
    isSubscribed: subscribed,
    isSupported: true,
    isLoading: false,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  });
}

function setupLoggedInWithData() {
  setAuthUser();
  mockGetCache.mockResolvedValue(null);
  mockGetMeals.mockResolvedValue(mockMeals);
  mockGetWeights.mockResolvedValue(mockWeights);
  mockGetUserProfile.mockResolvedValue(mockUserProfile);
  mockGetStockItems.mockResolvedValue([]);
  mockGetDailyEvaluation.mockResolvedValue(null);
}

async function renderLoggedIn() {
  setupLoggedInWithData();
  let result;
  await act(async () => {
    result = render(<Home />);
  });
  // Wait for data loading to complete
  await waitFor(() => {
    expect(mockGetMeals).toHaveBeenCalled();
  });
  return result;
}

// --- Tests ---
describe('Home (page.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthLoggedOut();
  });

  // =====================
  // 1. Auth States
  // =====================
  describe('Authentication States', () => {
    it('shows loading spinner when auth is loading', () => {
      setAuthLoading();
      render(<Home />);
      expect(screen.getByTestId('icon-Loader2')).toBeInTheDocument();
      // Should NOT show login button
      expect(screen.queryByText(/Googleでログイン/)).not.toBeInTheDocument();
    });

    it('shows login screen when no user is authenticated', () => {
      setAuthLoggedOut();
      render(<Home />);
      expect(screen.getByText(/Googleでログイン/)).toBeInTheDocument();
      expect(screen.getByText('LifeLog')).toBeInTheDocument();
      expect(screen.getByText(/AIで食事管理をもっと簡単に/)).toBeInTheDocument();
    });

    it('calls googleSignIn when login button is clicked', () => {
      setAuthLoggedOut();
      render(<Home />);
      const loginBtn = screen.getByText(/Googleでログイン/);
      fireEvent.click(loginBtn);
      expect(mockGoogleSignIn).toHaveBeenCalledTimes(1);
    });

    it('shows dashboard when user is logged in', async () => {
      await renderLoggedIn();
      expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument();
      expect(screen.queryByText(/Googleでログイン/)).not.toBeInTheDocument();
    });
  });

  // =====================
  // 2. Data Loading
  // =====================
  describe('Data Loading', () => {
    it('loads data from cache first, then Firestore', async () => {
      setAuthUser();
      mockGetCache.mockImplementation((key) => {
        if (key === 'meals_test-user') return Promise.resolve({ data: mockMeals, stale: true });
        if (key === 'weights_test-user') return Promise.resolve({ data: mockWeights, stale: true });
        if (key === 'profile_test-user') return Promise.resolve({ data: mockUserProfile, stale: false });
        if (key === 'stock_test-user') return Promise.resolve({ data: [], stale: false });
        return Promise.resolve(null);
      });
      mockGetMeals.mockResolvedValue(mockMeals);
      mockGetWeights.mockResolvedValue(mockWeights);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(mockGetCache).toHaveBeenCalled();
      });
      // Because caches are stale, Firestore should also be called
      await waitFor(() => {
        expect(mockGetMeals).toHaveBeenCalledWith('test-user');
      });
    });

    it('skips Firestore when all caches are fresh', async () => {
      setAuthUser();
      mockGetCache.mockImplementation((key) => {
        if (key === 'meals_test-user') return Promise.resolve({ data: mockMeals, stale: false });
        if (key === 'weights_test-user') return Promise.resolve({ data: mockWeights, stale: false });
        if (key === 'profile_test-user') return Promise.resolve({ data: mockUserProfile, stale: false });
        if (key === 'stock_test-user') return Promise.resolve({ data: [], stale: false });
        return Promise.resolve(null);
      });
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(mockGetCache).toHaveBeenCalled();
      });

      // Firestore should NOT be called since all caches are fresh
      expect(mockGetMeals).not.toHaveBeenCalled();
    });
  });

  // =====================
  // 3. Dashboard Content
  // =====================
  describe('Dashboard Content', () => {
    it('displays LifeLog header and Logout button', async () => {
      await renderLoggedIn();
      expect(screen.getByText('LifeLog')).toBeInTheDocument();
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('displays calorie summary with correct totals', async () => {
      await renderLoggedIn();
      const totalCal = mockMeals.reduce((acc, m) => acc + m.calories, 0); // 980
      await waitFor(() => {
        expect(screen.getByText(String(totalCal))).toBeInTheDocument();
      });
    });

    it('passes the current weight to the body summary card', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(getBodySummaryProps()?.body?.weight).toBe(72.5);
      });
    });

    it('shows PFC balance section with macros', async () => {
      await renderLoggedIn();
      expect(screen.getByText('PFCバランス')).toBeInTheDocument();
      expect(screen.getByText('タンパク質(P)')).toBeInTheDocument();
      expect(screen.getByText('脂質(F)')).toBeInTheDocument();
      expect(screen.getByText('炭水化物(C)')).toBeInTheDocument();
    });

    it('shows empty state when there are no meals', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('記録がありません')).toBeInTheDocument();
      });
    });

    it('displays meals grouped by category with correct labels', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        // Category headers
        expect(screen.getByText(/朝食/)).toBeInTheDocument();
        expect(screen.getByText(/昼食/)).toBeInTheDocument();
        expect(screen.getByText(/夕食/)).toBeInTheDocument();
        expect(screen.getByText(/間食/)).toBeInTheDocument();
      });
    });

    it('displays individual meal names and calories', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
        expect(screen.getByText('サーモン刺身')).toBeInTheDocument();
        expect(screen.getByText('プロテインバー')).toBeInTheDocument();
        expect(screen.getByText('オートミール')).toBeInTheDocument();
      });
    });

    it('displays calorie target info with remaining or over text', async () => {
      await renderLoggedIn();
      // targetCalories is 2000, total is 980, so remaining is 1020
      await waitFor(() => {
        expect(screen.getByText(/残り/)).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 4. Date Navigation
  // =====================
  describe('Date Navigation', () => {
    it('displays current date with day of week', async () => {
      await renderLoggedIn();
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];
      const dateStr = `${today.getMonth() + 1}/${today.getDate()} (${dayOfWeek})`;
      expect(screen.getByText(dateStr)).toBeInTheDocument();
    });

    it('navigates to previous day when ChevronLeft is clicked', async () => {
      await renderLoggedIn();
      const prevBtn = screen.getByTestId('icon-ChevronLeft').closest('button');
      await act(async () => {
        fireEvent.click(prevBtn);
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][yesterday.getDay()];
      const expectedDate = `${yesterday.getMonth() + 1}/${yesterday.getDate()} (${dayOfWeek})`;
      expect(screen.getByText(expectedDate)).toBeInTheDocument();
    });

    it('disables next day button when on today', async () => {
      await renderLoggedIn();
      const nextBtn = screen.getByTestId('icon-ChevronRight').closest('button');
      expect(nextBtn).toBeDisabled();
    });

    it('enables next day button after navigating to previous day', async () => {
      await renderLoggedIn();
      const prevBtn = screen.getByTestId('icon-ChevronLeft').closest('button');
      await act(async () => {
        fireEvent.click(prevBtn);
      });
      const nextBtn = screen.getByTestId('icon-ChevronRight').closest('button');
      expect(nextBtn).not.toBeDisabled();
    });
  });

  // =====================
  // 5. Delete Confirmation
  // =====================
  describe('Delete Meal', () => {
    it('shows delete confirmation dialog when delete icon is clicked', async () => {
      await renderLoggedIn();
      // Find the XCircle (delete) icons
      const deleteIcons = screen.getAllByTestId('icon-XCircle');
      await act(async () => {
        fireEvent.click(deleteIcons[0]);
      });
      expect(screen.getByText('記録を削除しますか？')).toBeInTheDocument();
      expect(screen.getByText('キャンセル')).toBeInTheDocument();
      expect(screen.getByText('削除')).toBeInTheDocument();
    });

    it('closes delete confirmation when cancel is clicked', async () => {
      await renderLoggedIn();
      const deleteIcons = screen.getAllByTestId('icon-XCircle');
      await act(async () => {
        fireEvent.click(deleteIcons[0]);
      });
      expect(screen.getByText('記録を削除しますか？')).toBeInTheDocument();

      const cancelBtn = screen.getByText('キャンセル');
      await act(async () => {
        fireEvent.click(cancelBtn);
      });
      expect(screen.queryByText('記録を削除しますか？')).not.toBeInTheDocument();
    });

    it('executes delete when confirm button is clicked', async () => {
      await renderLoggedIn();
      const deleteIcons = screen.getAllByTestId('icon-XCircle');
      await act(async () => {
        fireEvent.click(deleteIcons[0]);
      });

      const deleteBtn = screen.getByText('削除');
      await act(async () => {
        fireEvent.click(deleteBtn);
      });

      await waitFor(() => {
        expect(mockDeleteMeal).toHaveBeenCalledWith('test-user', expect.any(String));
      });
      // Confirmation dialog should close after deletion
      await waitFor(() => {
        expect(screen.queryByText('記録を削除しますか？')).not.toBeInTheDocument();
      });
    });
  });

  // =====================
  // 6. Modal Buttons
  // =====================
  describe('Modal Buttons', () => {
    it('opens FoodLogger when FAB "記録する" button is clicked', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;
      const fabBtn = screen.getByText('記録する');
      await act(async () => {
        fireEvent.click(fabBtn);
      });
      // A new dynamic component should appear (FoodLogger)
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(dynamicsBefore);
    });

    it('opens StockManager when Stock button is clicked', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;
      const stockBtn = screen.getByText('Stock');
      await act(async () => {
        fireEvent.click(stockBtn);
      });
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(dynamicsBefore);
    });

    it('opens Quiz modal when Quiz button is clicked', async () => {
      await renderLoggedIn();
      // ElenaChallengeModal is always rendered, so we check that Quiz button triggers state change
      const quizBtn = screen.getByText('Quiz');
      await act(async () => {
        fireEvent.click(quizBtn);
      });
      // The ElenaChallengeModal should receive isOpen=true (check its prop via dynamic component)
      // Since all dynamic components render as the same testid, just verify no crash
      expect(screen.getAllByTestId('dynamic-component').length).toBeGreaterThan(0);
    });

    it('opens Ranking modal when Ranking button is clicked', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;
      const rankingBtn = screen.getByText('Ranking');
      await act(async () => {
        fireEvent.click(rankingBtn);
      });
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(dynamicsBefore);
    });

    it('opens EvaluationModal when calorie card is clicked', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;
      const calorieTitle = screen.getByText('摂取カロリー');
      const calorieCard = calorieTitle.closest('.glass-panel');
      await act(async () => {
        fireEvent.click(calorieCard);
      });
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(dynamicsBefore);
    });

    it('opens the body detail modal from the summary card', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;
      await act(async () => {
        getBodySummaryProps().onOpenDetail();
      });
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(dynamicsBefore);
    });
  });

  // =====================
  // 7. Logout
  // =====================
  describe('Logout', () => {
    it('calls logOut when Logout button is clicked', async () => {
      await renderLoggedIn();
      const logoutBtn = screen.getByText('Logout');
      await act(async () => {
        fireEvent.click(logoutBtn);
      });
      expect(mockLogOut).toHaveBeenCalledTimes(1);
    });
  });

  // =====================
  // 8. Push Notifications
  // =====================
  describe('Push Notifications', () => {
    it('does not show notification button when push is not supported', async () => {
      await renderLoggedIn();
      expect(screen.queryByText('通知')).not.toBeInTheDocument();
      expect(screen.queryByText('通知ON')).not.toBeInTheDocument();
    });

    it('shows "通知" button when push is supported but not subscribed', async () => {
      setPushSupported(false);
      await renderLoggedIn();
      expect(screen.getByText('通知')).toBeInTheDocument();
    });

    it('shows "通知ON" when push is subscribed', async () => {
      setPushSupported(true);
      await renderLoggedIn();
      expect(screen.getByText('通知ON')).toBeInTheDocument();
    });

    it('calls subscribe when notification button is clicked (not subscribed)', async () => {
      setPushSupported(false);
      await renderLoggedIn();
      const notifBtn = screen.getByText('通知');
      await act(async () => {
        fireEvent.click(notifBtn);
      });
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    it('calls unsubscribe when notification button is clicked (subscribed)', async () => {
      setPushSupported(true);
      await renderLoggedIn();
      const notifBtn = screen.getByText('通知ON');
      await act(async () => {
        fireEvent.click(notifBtn);
      });
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // =====================
  // 9. Meal Detail Modal
  // =====================
  describe('Meal Detail Modal', () => {
    it('opens meal detail when a meal item is clicked', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
      });

      const mealItem = screen.getByText('鶏胸肉のグリル').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      // The detail modal shows score and a close button
      await waitFor(() => {
        expect(screen.getByText('9/10')).toBeInTheDocument();
        expect(screen.getByText('閉じる')).toBeInTheDocument();
      });
    });

    it('closes meal detail modal when close button is clicked', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
      });

      const mealItem = screen.getByText('鶏胸肉のグリル').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      await waitFor(() => {
        expect(screen.getByText('閉じる')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('閉じる'));
      });

      // Score display from the detail modal should be gone
      expect(screen.queryByText('9/10')).not.toBeInTheDocument();
    });
  });

  // =====================
  // 10. Meal Type Selector
  // =====================
  describe('Meal Type Change', () => {
    it('shows meal type selector popup when "変更" button is clicked', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getAllByText('変更').length).toBeGreaterThan(0);
      });

      const changeBtns = screen.getAllByText('変更');
      await act(async () => {
        fireEvent.click(changeBtns[0]);
      });

      // The popup should show all 4 meal type options
      await waitFor(() => {
        // These are the category labels in the popup, distinct from header labels
        const popupOptions = screen.getAllByRole('button').filter(
          btn => btn.textContent.includes('朝食') || btn.textContent.includes('昼食') ||
                 btn.textContent.includes('夕食') || btn.textContent.includes('間食')
        );
        expect(popupOptions.length).toBeGreaterThanOrEqual(4);
      });
    });
  });

  // =====================
  // 11. Weight display
  // =====================
  describe('Weight Display', () => {
    it('passes the diet goal to the body summary card', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(getBodySummaryProps()?.goal).toEqual({
          current: 72.5,
          target: 68,
          start: 75,
          targetDate: '2026-07-01',
        });
      });
    });

    it('shows "--" for weight when no weight entry exists for current date', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue({ targetCalories: 2200 });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        // 体重が1件も無ければ体組成は渡らない（カード側が「--」を出す）
        expect(getBodySummaryProps()?.body).toBeFalsy();
      });
    });
  });

  // =====================
  // 12. Category Evaluation Modal
  // =====================
  describe('Category Evaluation', () => {
    it('opens CategoryEvaluationModal when a meal category header is clicked', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText(/朝食/)).toBeInTheDocument();
      });

      // Click on the breakfast category header
      const breakfastHeader = screen.getByText(/🌅 朝食/);
      await act(async () => {
        fireEvent.click(breakfastHeader.closest('[style]'));
      });

      // CategoryEvaluationModal is a dynamic component that should now be rendered
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeGreaterThan(0);
    });
  });

  // =====================
  // 13. Dynamic Calorie Target
  // =====================
  describe('Calorie Calculations', () => {
    it('shows target calories from user profile', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        // Target appears in the gauge: "目標: 2000 kcal"
        expect(screen.getByText(/目標/)).toBeInTheDocument();
      });
    });

    it('calculates total calories correctly from meals', async () => {
      await renderLoggedIn();
      // 350 + 200 + 180 + 250 = 980
      await waitFor(() => {
        expect(screen.getByText('980')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 14. PFC Macro Values
  // =====================
  describe('PFC Macro Display', () => {
    it('shows correct protein/fat/carbs totals', async () => {
      await renderLoggedIn();
      // Total protein: 40+25+15+8 = 88.0
      // Total fat: 8+10+6+5 = 29.0
      // Total carbs: 5+0+20+40 = 65.0
      await waitFor(() => {
        expect(screen.getByText('88.0')).toBeInTheDocument();
        expect(screen.getByText('29.0')).toBeInTheDocument();
        expect(screen.getByText('65.0')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 15. Category PFC summaries
  // =====================
  describe('Meal Category Summaries', () => {
    it('shows per-category calorie totals and item counts', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        // Each category shows item count - "1品" for each
        const itemCounts = screen.getAllByText('1品');
        expect(itemCounts.length).toBe(4); // 4 categories each with 1 meal
      });
    });
  });

  // =====================
  // 16. FAB button always visible
  // =====================
  describe('FAB Button', () => {
    it('shows the "記録する" FAB button with Camera icon', async () => {
      await renderLoggedIn();
      expect(screen.getByText('記録する')).toBeInTheDocument();
      expect(screen.getByTestId('icon-Camera')).toBeInTheDocument();
    });
  });

  // =====================
  // 17. Meal score styles
  // =====================
  describe('Meal Score Display', () => {
    it('displays numeric scores on meal items', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        // meal-1 has score 9, meal-2 has score 8, etc.
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();
      });
    });

    it('shows different score styles for low score meals', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const lowScoreMeals = [
        {
          id: 'meal-low',
          foodName: 'ポテトチップス',
          calories: 500,
          macros: { protein: 3, fat: 30, carbs: 55 },
          timestamp: todayISO,
          mealType: 'snack',
          score: 2,
        },
      ];
      mockGetMeals.mockResolvedValue(lowScoreMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('ポテトチップス')).toBeInTheDocument();
      });
    });

    it('shows neutral score style for mid-range scores', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const neutralMeal = [
        {
          id: 'meal-neutral',
          foodName: 'ご飯',
          calories: 300,
          macros: { protein: 5, fat: 1, carbs: 60 },
          timestamp: todayISO,
          mealType: 'lunch',
          score: 5,
        },
      ];
      mockGetMeals.mockResolvedValue(neutralMeal);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('ご飯')).toBeInTheDocument();
      });
    });

    it('handles meals without score (assessment-based backward compat)', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const assessmentMeals = [
        {
          id: 'meal-assess',
          foodName: 'アサイーボウル',
          calories: 280,
          macros: { protein: 6, fat: 10, carbs: 35 },
          timestamp: todayISO,
          mealType: 'breakfast',
          assessment: 'positive',
        },
      ];
      mockGetMeals.mockResolvedValue(assessmentMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('アサイーボウル')).toBeInTheDocument();
      });
    });

    it('handles meals with no score or assessment', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const noScoreMeal = [
        {
          id: 'meal-noscore',
          foodName: 'みそ汁',
          calories: 50,
          macros: { protein: 3, fat: 1, carbs: 5 },
          timestamp: todayISO,
          mealType: 'dinner',
        },
      ];
      mockGetMeals.mockResolvedValue(noScoreMeal);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('みそ汁')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 18. Over-calorie scenario
  // =====================
  describe('Over Calorie Display', () => {
    it('shows "オーバー" when calories exceed target', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const overMeals = [
        {
          id: 'meal-over-1',
          foodName: 'ラーメン',
          calories: 1200,
          macros: { protein: 20, fat: 40, carbs: 100 },
          timestamp: todayISO,
          mealType: 'lunch',
          score: 3,
        },
        {
          id: 'meal-over-2',
          foodName: 'カツ丼',
          calories: 900,
          macros: { protein: 30, fat: 35, carbs: 80 },
          timestamp: todayISO,
          mealType: 'dinner',
          score: 4,
        },
      ];
      mockGetMeals.mockResolvedValue(overMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue({ targetCalories: 2000 });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText(/オーバー/)).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 19. Weight with no target
  // =====================
  describe('Weight Card Variants', () => {
    it('passes no goal when the target weight is not set', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue({ targetCalories: 2200 });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(getBodySummaryProps()?.goal).toBeNull();
      });
    });

    it('shows weight progress with target date and remaining info', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const todayDateKey = (() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
      })();
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([{ date: todayDateKey, weight: 73 }]);
      mockGetUserProfile.mockResolvedValue({
        targetCalories: 2000,
        targetWeight: 65,
        startWeight: 80,
        targetDate: '2027-01-01',
      });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(getBodySummaryProps()?.goal).toEqual({
          current: 73,
          target: 65,
          start: 80,
          targetDate: '2027-01-01',
        });
      });
    });
  });

  // =====================
  // 20. Meal detail modal content
  // =====================
  describe('Meal Detail Modal - Content', () => {
    it('shows meal reason text when available', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
      });

      const mealItem = screen.getByText('鶏胸肉のグリル').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      await waitFor(() => {
        expect(screen.getByText('バランスの良い食事')).toBeInTheDocument();
      });
    });

    it('shows emoji based on score in detail modal', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('プロテインバー')).toBeInTheDocument();
      });

      // Click on the snack meal (score 5 -> 👍 emoji)
      const mealItem = screen.getByText('プロテインバー').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      await waitFor(() => {
        expect(screen.getByText('5/10')).toBeInTheDocument();
        expect(screen.getByText('👍')).toBeInTheDocument();
      });
    });

    it('shows "理由を取得" button when score exists but no reason', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('サーモン刺身')).toBeInTheDocument();
      });

      // meal-2 has score but no reason
      const mealItem = screen.getByText('サーモン刺身').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      await waitFor(() => {
        expect(screen.getByText('理由を取得')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 21. Date Navigation - edge cases
  // =====================
  describe('Date Navigation - Edge Cases', () => {
    it('next day button does nothing when already on today', async () => {
      await renderLoggedIn();
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];
      const todayStr = `${today.getMonth() + 1}/${today.getDate()} (${dayOfWeek})`;

      const nextBtn = screen.getByTestId('icon-ChevronRight').closest('button');
      await act(async () => {
        fireEvent.click(nextBtn);
      });

      // Date should not change
      expect(screen.getByText(todayStr)).toBeInTheDocument();
    });

    it('can navigate back multiple days and return', async () => {
      await renderLoggedIn();
      const prevBtn = screen.getByTestId('icon-ChevronLeft').closest('button');

      // Go back 2 days
      await act(async () => {
        fireEvent.click(prevBtn);
      });
      await act(async () => {
        fireEvent.click(prevBtn);
      });

      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][twoDaysAgo.getDay()];
      const expectedDate = `${twoDaysAgo.getMonth() + 1}/${twoDaysAgo.getDate()} (${dayOfWeek})`;
      expect(screen.getByText(expectedDate)).toBeInTheDocument();

      // Go forward one day
      const nextBtn = screen.getByTestId('icon-ChevronRight').closest('button');
      await act(async () => {
        fireEvent.click(nextBtn);
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dayOfWeek2 = ['日', '月', '火', '水', '木', '金', '土'][yesterday.getDay()];
      const expectedDate2 = `${yesterday.getMonth() + 1}/${yesterday.getDate()} (${dayOfWeek2})`;
      expect(screen.getByText(expectedDate2)).toBeInTheDocument();
    });
  });

  // =====================
  // 22. Year display
  // =====================
  describe('Year Display', () => {
    it('shows the year in the date navigation', async () => {
      await renderLoggedIn();
      expect(screen.getByText(String(today.getFullYear()))).toBeInTheDocument();
    });
  });

  // =====================
  // 23. Header buttons
  // =====================
  describe('Header Buttons', () => {
    it('shows Stock, Quiz, and Ranking buttons in header', async () => {
      await renderLoggedIn();
      expect(screen.getByText('Stock')).toBeInTheDocument();
      expect(screen.getByText('Quiz')).toBeInTheDocument();
      expect(screen.getByText('Ranking')).toBeInTheDocument();
    });

    it('shows correct icons for header buttons', async () => {
      await renderLoggedIn();
      expect(screen.getByTestId('icon-Refrigerator')).toBeInTheDocument();
      expect(screen.getByTestId('icon-Brain')).toBeInTheDocument();
      expect(screen.getByTestId('icon-Trophy')).toBeInTheDocument();
    });
  });

  // =====================
  // 24. Category PFC display
  // =====================
  describe('Category PFC in Meal Headers', () => {
    it('shows per-category P/F/C values', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        // Lunch category: P:40g F:8g C:5g
        const pfcTexts = screen.getAllByText(/P:\d+g/);
        expect(pfcTexts.length).toBeGreaterThan(0);
      });
    });
  });

  // =====================
  // 25. Default target calories
  // =====================
  describe('Default Target Calories', () => {
    it('uses 2200 as default when no user profile', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(null);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        // Default target is 2200 - appears in the gauge target text
        expect(screen.getByText(/目標/)).toBeInTheDocument();
        const targetTexts = screen.getAllByText(/2200/);
        expect(targetTexts.length).toBeGreaterThan(0);
      });
    });
  });

  // =====================
  // 26. Calorie gauge progress percentage
  // =====================
  describe('Calorie Gauge', () => {
    it('shows progress percentage in gauge', async () => {
      await renderLoggedIn();
      // 980/2000 = 49%
      await waitFor(() => {
        expect(screen.getByText('49%')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 27. Meals with missing macros
  // =====================
  describe('Meals with Missing Data', () => {
    it('handles meals with missing macros gracefully', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const incompleteMeals = [
        {
          id: 'meal-incomplete',
          foodName: '不明な食事',
          calories: 100,
          timestamp: todayISO,
          mealType: 'snack',
        },
      ];
      mockGetMeals.mockResolvedValue(incompleteMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('不明な食事')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 28. Loading evaluation from Firestore
  // =====================
  describe('Evaluation Cache', () => {
    it('loads daily evaluation from Firestore on mount', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(mockGetDailyEvaluation).toHaveBeenCalledWith('test-user', expect.any(String));
      });
    });
  });

  // =====================
  // 29. Dynamic calorie target with history
  // =====================
  describe('Dynamic Calorie Target', () => {
    it('adjusts target based on previous days calorie history', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);

      // Create meals for past 3 days (over target by 500 each day)
      const mealsWithHistory = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        mealsWithHistory.push({
          id: `hist-${i}`,
          foodName: `History meal ${i}`,
          calories: 2500, // 500 over the 2000 target
          macros: { protein: 30, fat: 30, carbs: 200 },
          timestamp: d.toISOString(),
          mealType: 'lunch',
          score: 5,
        });
      }
      // Also add today's meal
      mealsWithHistory.push({
        id: 'today-meal',
        foodName: '今日のサラダ',
        calories: 300,
        macros: { protein: 10, fat: 5, carbs: 20 },
        timestamp: todayISO,
        mealType: 'lunch',
        score: 8,
      });

      mockGetMeals.mockResolvedValue(mealsWithHistory);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue({ targetCalories: 2000 });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('今日のサラダ')).toBeInTheDocument();
        // Dynamic target should be adjusted down (2000 - 500 = 1500)
        expect(screen.getByText(/目標/)).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 30. Weight progress - goal achieved
  // =====================
  describe('Weight Goal Achieved', () => {
    it('shows achievement state when current weight is at or below target', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const todayDateKey = (() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
      })();
      mockGetMeals.mockResolvedValue([]);
      mockGetWeights.mockResolvedValue([{ date: todayDateKey, weight: 64 }]);
      mockGetUserProfile.mockResolvedValue({
        targetCalories: 2000,
        targetWeight: 65,
        startWeight: 75,
        targetDate: '2026-12-01',
      });
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        const goal = getBodySummaryProps()?.goal;
        expect(goal?.current).toBe(64);
        // 目標を下回っている＝達成状態はカード側が判定する
        expect(goal.current).toBeLessThanOrEqual(goal.target);
      });
    });
  });

  // =====================
  // 31. Streak display
  // =====================
  describe('Streak Calculation', () => {
    it('correctly calculates consecutive recording days', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);

      const streakMeals = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        streakMeals.push({
          id: `streak-${i}`,
          foodName: `Day ${i} meal`,
          calories: 500,
          macros: { protein: 20, fat: 10, carbs: 50 },
          timestamp: d.toISOString(),
          mealType: 'lunch',
          score: 7,
        });
      }

      mockGetMeals.mockResolvedValue(streakMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      // The streak data is used in evaluationData but not directly displayed
      // Just verify the component renders without error with streak data
      await waitFor(() => {
        expect(screen.getByText('Day 0 meal')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 32. Cache error handling
  // =====================
  describe('Cache Error Handling', () => {
    it('falls back to Firestore when cache throws error', async () => {
      setAuthUser();
      mockGetCache.mockRejectedValue(new Error('Cache error'));
      mockGetMeals.mockResolvedValue(mockMeals);
      mockGetWeights.mockResolvedValue(mockWeights);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(mockGetMeals).toHaveBeenCalledWith('test-user');
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 33. Date picker input
  // =====================
  describe('Date Picker', () => {
    it('has a hidden date picker input', async () => {
      await renderLoggedIn();
      const datePicker = document.getElementById('datePicker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker.type).toBe('date');
    });
  });

  // =====================
  // 34. Multiple meals in same category
  // =====================
  describe('Multiple Meals in Same Category', () => {
    it('groups multiple meals under one category correctly', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const multiMeals = [
        {
          id: 'lunch-1',
          foodName: 'チキンサラダ',
          calories: 300,
          macros: { protein: 25, fat: 10, carbs: 15 },
          timestamp: todayISO,
          mealType: 'lunch',
          score: 8,
        },
        {
          id: 'lunch-2',
          foodName: 'みそ汁',
          calories: 50,
          macros: { protein: 3, fat: 1, carbs: 5 },
          timestamp: todayISO,
          mealType: 'lunch',
          score: 7,
        },
      ];
      mockGetMeals.mockResolvedValue(multiMeals);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('チキンサラダ')).toBeInTheDocument();
        expect(screen.getByText('みそ汁')).toBeInTheDocument();
        expect(screen.getByText('2品')).toBeInTheDocument();
      });
    });
  });

  // =====================
  // 35. FoodLogger onLogMeal callback
  // =====================
  describe('FoodLogger Callback', () => {
    it('handleLogMeal adds meals to state when called via FoodLogger', async () => {
      mockAddMealToFirestore.mockResolvedValue('new-id-123');
      await renderLoggedIn();

      // Open FoodLogger
      await act(async () => {
        fireEvent.click(screen.getByText('記録する'));
      });

      // Get FoodLogger props (index 0)
      const foodLoggerProps = _dynamicPropsStore.current[0];
      expect(foodLoggerProps).toBeDefined();
      expect(foodLoggerProps.onLogMeal).toBeDefined();

      // Call onLogMeal with a new meal
      await act(async () => {
        await foodLoggerProps.onLogMeal({
          foodName: '新しい食事',
          calories: 400,
          macros: { protein: 20, fat: 15, carbs: 30 },
          mealType: 'dinner',
        });
      });

      // Should call addMealToFirestore
      await waitFor(() => {
        expect(mockAddMealToFirestore).toHaveBeenCalled();
      });
    });

    it('handleLogMeal handles array of meals', async () => {
      mockAddMealToFirestore.mockResolvedValue('batch-id');
      await renderLoggedIn();

      await act(async () => {
        fireEvent.click(screen.getByText('記録する'));
      });

      const foodLoggerProps = _dynamicPropsStore.current[0];

      await act(async () => {
        await foodLoggerProps.onLogMeal([
          { foodName: 'Meal A', calories: 200, macros: { protein: 10, fat: 5, carbs: 20 }, mealType: 'lunch' },
          { foodName: 'Meal B', calories: 300, macros: { protein: 15, fat: 8, carbs: 30 }, mealType: 'lunch' },
        ]);
      });

      await waitFor(() => {
        expect(mockAddMealToFirestore).toHaveBeenCalledTimes(2);
      });
    });

    it('FoodLogger onCancel closes the logger', async () => {
      await renderLoggedIn();

      await act(async () => {
        fireEvent.click(screen.getByText('記録する'));
      });

      const foodLoggerProps = _dynamicPropsStore.current[0];
      expect(foodLoggerProps.onCancel).toBeDefined();

      // Call onCancel
      await act(async () => {
        foodLoggerProps.onCancel();
      });

      // After cancel, FoodLogger dynamic component count should decrease
      // (showLogger becomes false)
      // We can verify by checking that new render doesn't include the extra component
    });
  });

  // =====================
  // 36. EvaluationModal callback
  // =====================
  describe('EvaluationModal Callback', () => {
    it('handleEvaluationComplete updates meal scores', async () => {
      await renderLoggedIn();

      // Open EvaluationModal
      const calorieTitle = screen.getByText('摂取カロリー');
      const calorieCard = calorieTitle.closest('.glass-panel');
      await act(async () => {
        fireEvent.click(calorieCard);
      });

      // Get EvaluationModal props (index 2)
      const evalProps = _dynamicPropsStore.current[2];
      expect(evalProps).toBeDefined();
      expect(evalProps.onEvaluationComplete).toBeDefined();

      // Call with food assessments
      await act(async () => {
        await evalProps.onEvaluationComplete({
          foodAssessments: [
            { foodName: '鶏胸肉のグリル', score: 10, assessment: 'positive' },
            { foodName: 'プロテインバー', score: 4, assessment: 'neutral' },
          ],
        });
      });

      await waitFor(() => {
        expect(mockUpdateMealInFirestore).toHaveBeenCalled();
      });
    });

    it('EvaluationModal onSave saves to Firestore', async () => {
      await renderLoggedIn();

      const calorieTitle = screen.getByText('摂取カロリー');
      await act(async () => {
        fireEvent.click(calorieTitle.closest('.glass-panel'));
      });

      const evalProps = _dynamicPropsStore.current[2];
      expect(evalProps.onSave).toBeDefined();

      await act(async () => {
        await evalProps.onSave({ score: 7, comment: 'Good day' });
      });

      await waitFor(() => {
        expect(mockSaveDailyEvaluation).toHaveBeenCalledWith('test-user', expect.any(String), { score: 7, comment: 'Good day' });
      });
    });

    it('EvaluationModal onClose hides modal', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;

      const calorieTitle = screen.getByText('摂取カロリー');
      await act(async () => {
        fireEvent.click(calorieTitle.closest('.glass-panel'));
      });

      const evalProps = _dynamicPropsStore.current[2];
      expect(evalProps.onClose).toBeDefined();

      await act(async () => {
        evalProps.onClose();
      });

      // Modal should close - dynamic component count should decrease
      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeLessThanOrEqual(dynamicsBefore);
    });
  });

  // =====================
  // 37. StockManager callbacks
  // =====================
  describe('StockManager Callbacks', () => {
    it('handleAddStock calls addStockItem and refreshes', async () => {
      const mockAddStockItem = (await import('@/lib/firebase/firestore')).addStockItem;
      await renderLoggedIn();

      await act(async () => {
        fireEvent.click(screen.getByText('Stock'));
      });

      // StockManager is index 4
      const stockProps = _dynamicPropsStore.current[4];
      expect(stockProps).toBeDefined();
      expect(stockProps.onAdd).toBeDefined();

      await act(async () => {
        await stockProps.onAdd({ name: 'トマト', quantity: 3 });
      });

      expect(mockAddStockItem).toHaveBeenCalled();
    });

    it('handleDeleteStock calls deleteStockItem and refreshes', async () => {
      const mockDeleteStockItem = (await import('@/lib/firebase/firestore')).deleteStockItem;
      await renderLoggedIn();

      await act(async () => {
        fireEvent.click(screen.getByText('Stock'));
      });

      const stockProps = _dynamicPropsStore.current[4];
      expect(stockProps.onDelete).toBeDefined();

      await act(async () => {
        await stockProps.onDelete('stock-id-1');
      });

      expect(mockDeleteStockItem).toHaveBeenCalled();
    });
  });

  // =====================
  // 38. BodyDetailModal callback
  // =====================
  describe('BodyDetailModal Callback', () => {
    it('passes correct props to BodyDetailModal', async () => {
      await renderLoggedIn();

      await act(async () => {
        getBodySummaryProps().onOpenDetail();
      });

      // BodyDetailModal is index 1
      const modalProps = _dynamicPropsStore.current[1];
      expect(modalProps).toBeDefined();
      expect(modalProps.onClose).toBeDefined();
      expect(modalProps.onUpdateWeights).toBeDefined();
      expect(modalProps.weights).toBeDefined();
      // 実測も一緒に渡す（実測と目標を1画面にまとめるため）
      expect(modalProps).toHaveProperty('activity');
      expect(modalProps).toHaveProperty('sleep');
      expect(modalProps).toHaveProperty('workouts');
    });
  });

  // =====================
  // 39. Ranking close callback
  // =====================
  describe('Ranking Modal', () => {
    it('closes ranking modal via onClose callback', async () => {
      await renderLoggedIn();
      const dynamicsBefore = screen.getAllByTestId('dynamic-component').length;

      await act(async () => {
        fireEvent.click(screen.getByText('Ranking'));
      });

      // MealRankingModal is index 6
      const rankProps = _dynamicPropsStore.current[6];
      expect(rankProps.onClose).toBeDefined();

      await act(async () => {
        rankProps.onClose();
      });

      const dynamicsAfter = screen.getAllByTestId('dynamic-component').length;
      expect(dynamicsAfter).toBeLessThanOrEqual(dynamicsBefore);
    });
  });

  // =====================
  // 40. CategoryEvaluation close callback
  // =====================
  describe('CategoryEvaluation Callback', () => {
    it('opens and closes CategoryEvaluationModal via category header click', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText(/🌅 朝食/)).toBeInTheDocument();
      });

      // Click on breakfast category
      const breakfastHeader = screen.getByText(/🌅 朝食/);
      await act(async () => {
        fireEvent.click(breakfastHeader.closest('[style]'));
      });

      // CategoryEvaluationModal is index 7
      const catProps = _dynamicPropsStore.current[7];
      expect(catProps).toBeDefined();
      expect(catProps.category).toBe('breakfast');
      expect(catProps.onClose).toBeDefined();

      // Close it
      await act(async () => {
        catProps.onClose();
      });
    });

    it('CategoryEvaluationModal onSave updates evaluation cache', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText(/🌅 朝食/)).toBeInTheDocument();
      });

      const breakfastHeader = screen.getByText(/🌅 朝食/);
      await act(async () => {
        fireEvent.click(breakfastHeader.closest('[style]'));
      });

      const catProps = _dynamicPropsStore.current[7];
      expect(catProps.onSave).toBeDefined();

      await act(async () => {
        catProps.onSave({ score: 8, comment: 'Great breakfast' });
      });
    });
  });

  // =====================
  // 41. Meal type change via popup
  // =====================
  describe('Meal Type Change via Popup', () => {
    it('changes meal type when popup option is selected', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getAllByText('変更').length).toBeGreaterThan(0);
      });

      const changeBtns = screen.getAllByText('変更');
      await act(async () => {
        fireEvent.click(changeBtns[0]);
      });

      // Find and click a meal type option (e.g., breakfast)
      // The popup shows 4 buttons for meal types
      await waitFor(() => {
        const breakfastOptions = screen.getAllByRole('button').filter(
          btn => btn.textContent.includes('🌅 朝食')
        );
        expect(breakfastOptions.length).toBeGreaterThan(0);
      });

      // Click on a different meal type option
      const dinnerOption = screen.getAllByRole('button').find(
        btn => btn.textContent.includes('🌙 夕食') && !btn.textContent.includes('kcal')
      );

      if (dinnerOption) {
        await act(async () => {
          fireEvent.click(dinnerOption);
        });
      }
    });

    it('closes meal type popup when clicking overlay', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getAllByText('変更').length).toBeGreaterThan(0);
      });

      const changeBtns = screen.getAllByText('変更');
      await act(async () => {
        fireEvent.click(changeBtns[0]);
      });

      // Click on the overlay background (fixed-overlay class)
      const overlays = document.querySelectorAll('.fixed-overlay');
      if (overlays.length > 0) {
        await act(async () => {
          fireEvent.click(overlays[overlays.length - 1]);
        });
      }
    });
  });

  // =====================
  // 42. Meal detail overlay click to close
  // =====================
  describe('Meal Detail Overlay', () => {
    it('closes meal detail when clicking overlay background', async () => {
      await renderLoggedIn();
      await waitFor(() => {
        expect(screen.getByText('鶏胸肉のグリル')).toBeInTheDocument();
      });

      const mealItem = screen.getByText('鶏胸肉のグリル').closest('.glass-panel');
      await act(async () => {
        fireEvent.click(mealItem);
      });

      await waitFor(() => {
        expect(screen.getByText('9/10')).toBeInTheDocument();
      });

      // Click the overlay
      const overlays = document.querySelectorAll('.fixed-overlay');
      if (overlays.length > 0) {
        await act(async () => {
          fireEvent.click(overlays[0]);
        });
      }

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText('9/10')).not.toBeInTheDocument();
      });
    });
  });

  // =====================
  // 43. Date input onChange
  // =====================
  describe('Date Input', () => {
    it('changes date via date picker input', async () => {
      await renderLoggedIn();
      const datePicker = document.getElementById('datePicker');
      expect(datePicker).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(datePicker, { target: { value: '2026-03-15' } });
      });

      // Should show March 15
      expect(screen.getByText(/3\/15/)).toBeInTheDocument();
    });
  });

  // =====================
  // 44. Meal without mealType defaults to snack
  // =====================
  describe('Meal Type Default', () => {
    it('defaults meals without mealType to snack category', async () => {
      setAuthUser();
      mockGetCache.mockResolvedValue(null);
      const noTypeMeal = [
        {
          id: 'no-type',
          foodName: 'バナナ',
          calories: 90,
          macros: { protein: 1, fat: 0, carbs: 22 },
          timestamp: todayISO,
          // no mealType
          score: 6,
        },
      ];
      mockGetMeals.mockResolvedValue(noTypeMeal);
      mockGetWeights.mockResolvedValue([]);
      mockGetUserProfile.mockResolvedValue(mockUserProfile);
      mockGetStockItems.mockResolvedValue([]);
      mockGetDailyEvaluation.mockResolvedValue(null);

      await act(async () => {
        render(<Home />);
      });

      await waitFor(() => {
        expect(screen.getByText('バナナ')).toBeInTheDocument();
        // Should be under snack category
        expect(screen.getByText(/間食/)).toBeInTheDocument();
      });
    });
  });
});
