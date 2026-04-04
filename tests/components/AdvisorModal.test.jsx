import { render, screen, fireEvent } from '@testing-library/react';
import AdvisorModal from '@/components/AdvisorModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('@/app/actions/meal-advisor', () => ({
  suggestNextMeal: vi.fn().mockResolvedValue({
    suggestions: [
      { name: '鶏むね肉サラダ', reason: 'タンパク質が豊富' },
    ],
    advice: 'バランスを意識しましょう',
  }),
}));

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  saveLinkCode: vi.fn(),
}));

vi.mock('@/components/LineConnector', () => ({
  default: () => <div data-testid="line-connector" />,
}));

describe('AdvisorModal', () => {
  const savedSuggestions = {
    suggestions: [
      { name: 'サーモン定食', reason: 'オメガ3が豊富' },
      { name: '豆腐ハンバーグ', reason: '低カロリー高タンパク' },
    ],
    advice: '夕食は軽めにしましょう',
    targetType: 'dinner',
    mealCount: 3,
    mealTypes: 'breakfast,lunch,snack',
  };

  const defaultProps = {
    history: [
      { foodName: '朝食', mealType: 'breakfast' },
      { foodName: '昼食', mealType: 'lunch' },
      { foodName: '間食', mealType: 'snack' },
    ],
    dailyLog: { totalCalories: 1200 },
    targetType: 'dinner',
    onClose: vi.fn(),
    onSuggestionClick: vi.fn(),
    stockItems: [],
    savedState: savedSuggestions,
    onSave: vi.fn(),
    userId: 'test-user',
    profile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with saved suggestions without loading', () => {
    render(<AdvisorModal {...defaultProps} />);
    expect(screen.getByText('AI 食事アドバイザー')).toBeInTheDocument();
    expect(screen.getByText('サーモン定食')).toBeInTheDocument();
    expect(screen.getByText('豆腐ハンバーグ')).toBeInTheDocument();
  });

  it('shows advice text', () => {
    render(<AdvisorModal {...defaultProps} />);
    expect(screen.getByText(/夕食は軽めにしましょう/)).toBeInTheDocument();
  });

  it('calls onSuggestionClick when suggestion clicked', () => {
    render(<AdvisorModal {...defaultProps} />);
    fireEvent.click(screen.getByText('サーモン定食'));
    expect(defaultProps.onSuggestionClick).toHaveBeenCalledWith('サーモン定食');
  });

  it('calls onClose on close button', () => {
    render(<AdvisorModal {...defaultProps} />);
    // Find close button (the X icon button in header)
    const buttons = screen.getAllByTestId('icon-X');
    const closeBtn = buttons[0].closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows loading state when no saved suggestions', () => {
    render(<AdvisorModal {...defaultProps} savedState={null} />);
    expect(screen.getByText('あなたの栄養状態を分析中...')).toBeInTheDocument();
  });
});
