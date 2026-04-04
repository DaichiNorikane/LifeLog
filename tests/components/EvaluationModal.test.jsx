import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EvaluationModal from '@/components/EvaluationModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

const mockEvaluateDailyLog = vi.fn().mockResolvedValue({
  score: 75,
  title: 'まずまずの一日',
  advice: 'タンパク質をもう少し増やしましょう',
  characterStatus: 'NORMAL',
  model: 'gemini-flash',
});

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateDailyLog: (...args) => mockEvaluateDailyLog(...args),
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

// Mock LineConnector used inside EvaluationModal
vi.mock('@/components/LineConnector', () => ({
  default: () => <div data-testid="line-connector" />,
}));

describe('EvaluationModal', () => {
  const mockEvaluation = {
    score: 85,
    title: '素晴らしい一日！',
    advice: 'バランスの良い食事でした。**タンパク質**も十分です。',
    characterStatus: 'CHEER',
    model: 'gemini-flash',
    mealTypeEvaluations: {
      breakfast: { score: 8, comment: '良い朝食' },
      lunch: { score: 7, comment: 'まあまあの昼食' },
      dinner: { score: 3, comment: '夕食は改善が必要' },
      snack: { score: null, comment: null },
    },
  };

  const defaultProps = {
    data: { totalCalories: 1800, meals: [] },
    onClose: vi.fn(),
    onEvaluationComplete: vi.fn(),
    savedResult: null,
    onSave: vi.fn(),
    stockItems: [],
    isToday: true,
    dateLabel: '',
    userId: 'test-user',
    userProfile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Loading state ---

  it('shows loading state when no saved result', () => {
    render(<EvaluationModal {...defaultProps} />);
    expect(screen.getByText('AI専属コーチが分析中...')).toBeInTheDocument();
  });

  it('shows loading description text', () => {
    render(<EvaluationModal {...defaultProps} />);
    expect(screen.getByText(/栄養バランス、カロリー、食事タイミングを/)).toBeInTheDocument();
  });

  // --- Result display ---

  it('displays score and title when savedResult provided', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('素晴らしい一日！')).toBeInTheDocument();
  });

  it('displays advice text with bold parsing', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    // **タンパク質** should be parsed into <strong>
    const boldEl = screen.getByText('タンパク質');
    expect(boldEl.tagName).toBe('STRONG');
  });

  it('displays the model badge', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    expect(screen.getByText(/Analyzed by gemini-flash/)).toBeInTheDocument();
  });

  // --- Score ranges and character status ---

  it('shows CHEER status icon for CHEER characterStatus', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    // CHEER status shows ✨ emoji
    expect(screen.getByText('✨')).toBeInTheDocument();
  });

  it('shows SCOLD status icon for SCOLD characterStatus', () => {
    const scoldResult = { ...mockEvaluation, characterStatus: 'SCOLD', score: 30 };
    render(<EvaluationModal {...defaultProps} savedResult={scoldResult} />);
    expect(screen.getByText('⚡')).toBeInTheDocument();
  });

  it('shows LOGIC status icon for LOGIC characterStatus', () => {
    const logicResult = { ...mockEvaluation, characterStatus: 'LOGIC', score: 60 };
    render(<EvaluationModal {...defaultProps} savedResult={logicResult} />);
    expect(screen.getByText('📉')).toBeInTheDocument();
  });

  it('shows ENCOURAGE status icon for ENCOURAGE characterStatus', () => {
    const encourageResult = { ...mockEvaluation, characterStatus: 'ENCOURAGE', score: 55 };
    render(<EvaluationModal {...defaultProps} savedResult={encourageResult} />);
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('shows default icon for unknown characterStatus', () => {
    const normalResult = { ...mockEvaluation, characterStatus: 'UNKNOWN', score: 50 };
    render(<EvaluationModal {...defaultProps} savedResult={normalResult} />);
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  // --- Score-based Elena images ---

  it('uses score 100 image for perfect score', () => {
    const perfectResult = { ...mockEvaluation, score: 100 };
    render(<EvaluationModal {...defaultProps} savedResult={perfectResult} />);
    const img = screen.getByAltText('Elena');
    expect(img.src).toContain('elena_score_100');
  });

  it('uses score 90-99 image for high score', () => {
    const highResult = { ...mockEvaluation, score: 92 };
    render(<EvaluationModal {...defaultProps} savedResult={highResult} />);
    const img = screen.getByAltText('Elena');
    expect(img.src).toContain('elena_score_90_99');
  });

  it('uses score 20-50 image for low score', () => {
    const lowResult = { ...mockEvaluation, score: 35 };
    render(<EvaluationModal {...defaultProps} savedResult={lowResult} />);
    const img = screen.getByAltText('Elena');
    expect(img.src).toContain('elena_score_20_50');
  });

  it('uses score 0-20 image for very low score', () => {
    const veryLowResult = { ...mockEvaluation, score: 10 };
    render(<EvaluationModal {...defaultProps} savedResult={veryLowResult} />);
    const img = screen.getByAltText('Elena');
    expect(img.src).toContain('elena_score_0_20');
  });

  // --- Close action ---

  it('calls onClose when close button clicked', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    const closeBtn = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // --- Meal type evaluations ---

  it('displays meal type evaluations when present', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    expect(screen.getByText('食事別評価')).toBeInTheDocument();
    expect(screen.getByText('朝食')).toBeInTheDocument();
    expect(screen.getByText('良い朝食')).toBeInTheDocument();
    expect(screen.getByText('8点')).toBeInTheDocument();
  });

  it('shows lunch evaluation', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    expect(screen.getByText('昼食')).toBeInTheDocument();
    expect(screen.getByText('まあまあの昼食')).toBeInTheDocument();
    expect(screen.getByText('7点')).toBeInTheDocument();
  });

  it('shows dinner evaluation with low score', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    expect(screen.getByText('夕食')).toBeInTheDocument();
    expect(screen.getByText('夕食は改善が必要')).toBeInTheDocument();
    expect(screen.getByText('3点')).toBeInTheDocument();
  });

  it('skips meal types with null score', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} />);
    // snack has null score, should not be rendered
    expect(screen.queryByText('間食')).not.toBeInTheDocument();
  });

  it('does not show meal evaluations section when not present', () => {
    const noMealResult = { ...mockEvaluation, mealTypeEvaluations: undefined };
    render(<EvaluationModal {...defaultProps} savedResult={noMealResult} />);
    expect(screen.queryByText('食事別評価')).not.toBeInTheDocument();
  });

  // --- Re-evaluation ---

  it('shows re-evaluation button when isToday', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} isToday={true} />);
    expect(screen.getByText('再評価')).toBeInTheDocument();
  });

  it('hides re-evaluation button when not today', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} isToday={false} />);
    expect(screen.queryByText('再評価')).not.toBeInTheDocument();
  });

  it('triggers re-evaluation when re-eval button is clicked', async () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} isToday={true} />);
    const reEvalBtn = screen.getByText('再評価');
    fireEvent.click(reEvalBtn);

    await waitFor(() => {
      expect(mockEvaluateDailyLog).toHaveBeenCalledWith(defaultProps.data, defaultProps.stockItems);
    });
  });

  // --- Date label ---

  it('shows "今日のスコア" when isToday is true', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} isToday={true} />);
    expect(screen.getByText('今日のスコア')).toBeInTheDocument();
  });

  it('shows date label for past dates', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} isToday={false} dateLabel="3/15" />);
    expect(screen.getByText('3/15のスコア')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error state when evaluation fails', async () => {
    mockEvaluateDailyLog.mockResolvedValueOnce({ error: 'API error' });
    render(<EvaluationModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/評価の生成に失敗しました/)).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    mockEvaluateDailyLog.mockResolvedValueOnce({ error: 'API error' });
    render(<EvaluationModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('再試行')).toBeInTheDocument();
    });
  });

  it('shows close button in error state', async () => {
    mockEvaluateDailyLog.mockResolvedValueOnce({ error: 'API error' });
    render(<EvaluationModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('閉じる')).toBeInTheDocument();
    });
  });

  // --- Suggestions section ---

  it('displays suggestions when present in result', () => {
    const resultWithSuggestions = {
      ...mockEvaluation,
      suggestions: [
        { name: 'サラダチキン', reason: 'タンパク質が豊富', calories: 120 },
        { name: 'プロテインバー', reason: '手軽に栄養補給', calories: 200 },
      ],
      mealCategory: '次のおすすめ',
      detectedContext: '夕食後の間食として',
    };
    render(<EvaluationModal {...defaultProps} savedResult={resultWithSuggestions} />);
    expect(screen.getByText('次のおすすめ')).toBeInTheDocument();
    expect(screen.getByText('夕食後の間食として')).toBeInTheDocument();
    expect(screen.getByText('サラダチキン')).toBeInTheDocument();
    expect(screen.getByText('タンパク質が豊富')).toBeInTheDocument();
    expect(screen.getByText('約120kcal')).toBeInTheDocument();
  });

  it('does not show suggestions section when empty', () => {
    const noSuggestions = { ...mockEvaluation, suggestions: [] };
    render(<EvaluationModal {...defaultProps} savedResult={noSuggestions} />);
    expect(screen.queryByText('次の食事提案')).not.toBeInTheDocument();
  });

  // --- LINE notification ---

  it('shows LINE notification button when userProfile has lineUserId', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} userProfile={{ lineUserId: 'line-123' }} />);
    expect(screen.getByText('LINEに通知')).toBeInTheDocument();
  });

  it('does not show LINE notification button without lineUserId', () => {
    render(<EvaluationModal {...defaultProps} savedResult={mockEvaluation} userProfile={null} />);
    expect(screen.queryByText('LINEに通知')).not.toBeInTheDocument();
  });

  // --- Callbacks ---

  it('calls onSave and onEvaluationComplete after successful evaluation', async () => {
    const evalResult = {
      score: 80,
      title: 'Good',
      advice: 'Nice',
      characterStatus: 'NORMAL',
      model: 'gemini-flash',
    };
    mockEvaluateDailyLog.mockResolvedValueOnce(evalResult);

    render(<EvaluationModal {...defaultProps} />);

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith(evalResult);
      expect(defaultProps.onEvaluationComplete).toHaveBeenCalledWith(evalResult);
    });
  });
});
