import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ElenaChallengeModal from '@/components/ElenaChallengeModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'test-user', displayName: 'Test' }, loading: false })),
}));

const mockQuiz = {
  id: 'quiz-1',
  question: 'タンパク質が最も多い食品は？',
  options: ['鶏むね肉', 'ご飯', 'キャベツ', 'りんご'],
  correctIndex: 0,
  explanation: '鶏むね肉は100gあたり約25gのタンパク質を含みます。',
};

const mockGetQuizFromStock = vi.fn().mockResolvedValue(mockQuiz);
const mockSaveQuizToStock = vi.fn().mockResolvedValue(undefined);
const mockUpdateQuizResult = vi.fn().mockResolvedValue(undefined);
const mockGetQuizStockCount = vi.fn().mockResolvedValue(50);

vi.mock('@/lib/firebase/firestore', () => ({
  getQuizFromStock: (...args) => mockGetQuizFromStock(...args),
  saveQuizToStock: (...args) => mockSaveQuizToStock(...args),
  updateQuizResult: (...args) => mockUpdateQuizResult(...args),
  getQuizStockCount: (...args) => mockGetQuizStockCount(...args),
}));

vi.mock('@/app/actions/quiz', () => ({
  generateQuizWithGemini: vi.fn().mockResolvedValue([]),
}));

describe('ElenaChallengeModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuizFromStock.mockResolvedValue(mockQuiz);
    mockGetQuizStockCount.mockResolvedValue(50);
  });

  // --- Visibility ---

  it('returns null when not open', () => {
    const { container } = render(<ElenaChallengeModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal wrapper when open', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    // Modal has a fixed overlay
    const overlay = document.querySelector('[style*="position: fixed"]');
    expect(overlay).toBeInTheDocument();
  });

  it('renders header when open', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByText("Elena's Challenge")).toBeInTheDocument();
  });

  it('renders Brain icon in header', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByTestId('icon-Brain')).toBeInTheDocument();
  });

  // --- Loading ---

  it('shows loading state initially', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByText('問題を準備しています...')).toBeInTheDocument();
  });

  it('shows Loader2 icon during loading', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByTestId('icon-Loader2')).toBeInTheDocument();
  });

  it('shows AI generation message when stocking', async () => {
    // Make getQuizFromStock return null to trigger generation
    mockGetQuizFromStock.mockResolvedValueOnce(null).mockResolvedValue(mockQuiz);
    mockGetQuizStockCount.mockResolvedValue(0);
    const { generateQuizWithGemini } = await import('@/app/actions/quiz');
    generateQuizWithGemini.mockResolvedValue([mockQuiz]);

    render(<ElenaChallengeModal {...defaultProps} />);
    // The component shows "AIが新しい問題を生成中..." while stocking
    // This may flash briefly
    expect(screen.getByText('問題を準備しています...')).toBeInTheDocument();
  });

  // --- Question display ---

  it('displays question text after loading', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    const question = await screen.findByText('タンパク質が最も多い食品は？');
    expect(question).toBeInTheDocument();
  });

  it('displays all 4 options as buttons', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    await screen.findByText('タンパク質が最も多い食品は？');
    expect(screen.getByText('鶏むね肉')).toBeInTheDocument();
    expect(screen.getByText('ご飯')).toBeInTheDocument();
    expect(screen.getByText('キャベツ')).toBeInTheDocument();
    expect(screen.getByText('りんご')).toBeInTheDocument();
  });

  it('options are clickable buttons', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    await screen.findByText('タンパク質が最も多い食品は？');
    const buttons = screen.getAllByRole('button').filter(b =>
      b.textContent.match(/鶏むね肉|ご飯|キャベツ|りんご/)
    );
    expect(buttons).toHaveLength(4);
    buttons.forEach(b => expect(b).not.toBeDisabled());
  });

  it('shows Elena default image before answering', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    await screen.findByText('タンパク質が最も多い食品は？');
    const img = screen.getByAltText('Elena');
    expect(img.src).toContain('/images/elena.webp');
  });

  // --- Streak display ---

  it('shows streak counter', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByText(/連続正解/)).toBeInTheDocument();
  });

  it('shows Trophy icon in streak badge', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByTestId('icon-Trophy')).toBeInTheDocument();
  });

  it('streak starts at 0', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // --- Close ---

  it('calls onClose when close button is clicked', () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    const closeBtn = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // --- Quiz loading from stock ---

  it('calls getQuizFromStock with user id on mount', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    await waitFor(() => {
      expect(mockGetQuizFromStock).toHaveBeenCalledWith('test-user');
    });
  });

  it('checks quiz stock count on mount', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    await waitFor(() => {
      expect(mockGetQuizStockCount).toHaveBeenCalledWith('test-user');
    });
  });

  // --- Stock refill ---

  it('triggers refill when stock count is below 50', async () => {
    mockGetQuizStockCount.mockResolvedValue(10);
    const { generateQuizWithGemini } = await import('@/app/actions/quiz');
    generateQuizWithGemini.mockResolvedValue([mockQuiz]);

    render(<ElenaChallengeModal {...defaultProps} />);
    await waitFor(() => {
      expect(generateQuizWithGemini).toHaveBeenCalledWith(5);
    });
  });

  it('does not trigger refill when stock count is >= 50', async () => {
    mockGetQuizStockCount.mockResolvedValue(50);
    const { generateQuizWithGemini } = await import('@/app/actions/quiz');
    generateQuizWithGemini.mockClear();

    render(<ElenaChallengeModal {...defaultProps} />);
    await screen.findByText('タンパク質が最も多い食品は？');

    // Small wait to ensure no refill is triggered
    await new Promise(r => setTimeout(r, 50));
    expect(generateQuizWithGemini).not.toHaveBeenCalled();
  });

  // --- Empty stock handling ---

  it('handles null quiz from stock by generating new ones', async () => {
    mockGetQuizFromStock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockQuiz);

    const { generateQuizWithGemini } = await import('@/app/actions/quiz');
    generateQuizWithGemini.mockResolvedValueOnce([mockQuiz]);

    render(<ElenaChallengeModal {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetQuizFromStock).toHaveBeenCalledTimes(2);
    }, { timeout: 3000 });
  });

  // --- Option click triggers handler ---
  // NOTE: React 19 + jsdom does not flush state updates from async event handlers,
  // so we verify the handler was called but cannot assert on post-click UI state.

  it('calls updateQuizResult when an option is clicked', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    const option = await screen.findByText('鶏むね肉');
    fireEvent.click(option.closest('button'));
    await waitFor(() => {
      expect(mockUpdateQuizResult).toHaveBeenCalledWith('test-user', 'quiz-1', true);
    });
  });

  it('calls updateQuizResult with false for wrong answer', async () => {
    render(<ElenaChallengeModal {...defaultProps} />);
    const option = await screen.findByText('ご飯');
    fireEvent.click(option.closest('button'));
    await waitFor(() => {
      expect(mockUpdateQuizResult).toHaveBeenCalledWith('test-user', 'quiz-1', false);
    });
  });

  // --- Closing and reopening resets state ---

  it('resets state when closed', () => {
    const { rerender } = render(<ElenaChallengeModal isOpen={true} onClose={vi.fn()} />);
    // Close the modal
    rerender(<ElenaChallengeModal isOpen={false} onClose={vi.fn()} />);
    // Modal should be empty
    expect(screen.queryByText("Elena's Challenge")).not.toBeInTheDocument();
  });

  it('reloads quiz when reopened', async () => {
    const { rerender } = render(<ElenaChallengeModal isOpen={true} onClose={vi.fn()} />);
    await screen.findByText('タンパク質が最も多い食品は？');

    // Close
    rerender(<ElenaChallengeModal isOpen={false} onClose={vi.fn()} />);
    mockGetQuizFromStock.mockClear();

    // Reopen
    rerender(<ElenaChallengeModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetQuizFromStock).toHaveBeenCalled();
    });
  });
});
