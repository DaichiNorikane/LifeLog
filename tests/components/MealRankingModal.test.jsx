import { render, screen, fireEvent } from '@testing-library/react';
import MealRankingModal from '@/components/MealRankingModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('@/app/actions/daily-evaluation', () => ({
  generateMealRanking: vi.fn().mockResolvedValue({
    best: [
      { foodName: 'サラダチキン', date: '4/1', calories: 200, reason: '低脂質高タンパク' },
      { foodName: 'サーモン刺身', date: '3/30', calories: 300, reason: 'オメガ3豊富' },
      { foodName: 'オートミール', date: '3/29', calories: 250, reason: '食物繊維たっぷり' },
    ],
    worst: [
      { foodName: 'カツカレー', date: '4/1', calories: 900, reason: '高カロリー高脂質' },
      { foodName: 'ラーメン大盛り', date: '3/31', calories: 1200, reason: '塩分過多' },
      { foodName: 'ポテトチップス', date: '3/28', calories: 500, reason: '栄養価が低い' },
    ],
    model: 'gemini-flash',
  }),
}));

describe('MealRankingModal', () => {
  const meals = [
    { foodName: 'サラダチキン', calories: 200, macros: { protein: 30, fat: 3, carbs: 1 }, timestamp: '2026-04-01T12:00:00', mealType: 'lunch' },
  ];

  const defaultProps = {
    meals,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    render(<MealRankingModal {...defaultProps} />);
    expect(screen.getByText('食事履歴からランキングを作成中...')).toBeInTheDocument();
  });

  it('renders header', () => {
    render(<MealRankingModal {...defaultProps} />);
    expect(screen.getByText('Meal Ranking')).toBeInTheDocument();
  });

  it('calls onClose on close button', () => {
    render(<MealRankingModal {...defaultProps} />);
    const closeBtn = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows error when no meals provided', async () => {
    render(<MealRankingModal meals={[]} onClose={vi.fn()} />);
    // The component checks meals.length === 0 and sets error
    const errorText = await screen.findByText('食事記録がありません。まずは食事を記録してください。');
    expect(errorText).toBeInTheDocument();
  });

  it('displays best and worst meals after loading', async () => {
    render(<MealRankingModal {...defaultProps} />);
    // Wait for async ranking fetch
    const bestItem = await screen.findByText('サラダチキン');
    expect(bestItem).toBeInTheDocument();
    expect(screen.getByText('カツカレー')).toBeInTheDocument();
    expect(screen.getByText('ベスト3 🏆')).toBeInTheDocument();
    expect(screen.getByText('ワースト3 💀')).toBeInTheDocument();
  });
});
