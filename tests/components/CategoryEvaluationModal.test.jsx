import { render, screen, fireEvent } from '@testing-library/react';
import CategoryEvaluationModal from '@/components/CategoryEvaluationModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateMealCategory: vi.fn().mockResolvedValue({
    score: 8,
    comment: '朝食として理想的な組み合わせです',
    advice: 'フルーツを追加するとさらに良いでしょう',
  }),
}));

describe('CategoryEvaluationModal', () => {
  const meals = [
    { foodName: 'トースト', calories: 250, mealType: 'breakfast', macros: { protein: 8, fat: 5, carbs: 40 } },
    { foodName: '目玉焼き', calories: 150, mealType: 'breakfast', macros: { protein: 12, fat: 10, carbs: 1 } },
    { foodName: 'カレー', calories: 700, mealType: 'lunch', macros: { protein: 20, fat: 15, carbs: 80 } },
  ];

  const savedResult = {
    score: 8,
    comment: '朝食として理想的な組み合わせです',
    advice: 'フルーツを追加するとさらに良いでしょう',
  };

  const defaultProps = {
    category: 'breakfast',
    meals,
    onClose: vi.fn(),
    stockItems: [],
    savedResult: null,
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state when no saved result', () => {
    render(<CategoryEvaluationModal {...defaultProps} />);
    expect(screen.getByText('エレナが評価中...')).toBeInTheDocument();
  });

  it('displays score when saved result provided', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('点')).toBeInTheDocument();
  });

  it('displays comment when saved result provided', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    expect(screen.getByText('朝食として理想的な組み合わせです')).toBeInTheDocument();
  });

  it('displays advice when saved result provided', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    expect(screen.getByText('フルーツを追加するとさらに良いでしょう')).toBeInTheDocument();
  });

  it('calls onClose on close button', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    const closeBtn = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows header with category label', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    expect(screen.getByText('朝食の評価')).toBeInTheDocument();
  });

  it('displays recorded menu items for the category', () => {
    render(<CategoryEvaluationModal {...defaultProps} savedResult={savedResult} />);
    expect(screen.getByText('トースト')).toBeInTheDocument();
    expect(screen.getByText('目玉焼き')).toBeInTheDocument();
    // Lunch item should not appear
    expect(screen.queryByText('カレー')).not.toBeInTheDocument();
  });
});
