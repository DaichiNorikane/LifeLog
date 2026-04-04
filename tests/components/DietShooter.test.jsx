import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DietShooter from '@/components/DietShooter';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('@/lib/firebase/firestore', () => ({
  saveGameScore: vi.fn().mockResolvedValue(undefined),
  getLeaderboard: vi.fn().mockResolvedValue([]),
  resetLeaderboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock SoundManager
vi.mock('@/lib/game/SoundManager', () => ({
  soundManager: {
    init: vi.fn(),
    play: vi.fn(),
    playBGM: vi.fn(),
    stopBGM: vi.fn(),
  },
}));

// Mock canvas
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  canvas: { width: 400, height: 700 },
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  textAlign: '',
  textBaseline: '',
  globalAlpha: 1,
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

describe('DietShooter', () => {
  const defaultProps = {
    meals: [
      { foodName: 'サラダ', calories: 200, macros: { protein: 5, fat: 3, carbs: 20 } },
    ],
    user: { uid: 'test-user', displayName: 'Test' },
    userProfile: { targetCalories: 2000 },
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<DietShooter {...defaultProps} />);
    expect(screen.getByTestId('icon-X')).toBeInTheDocument();
  });

  it('displays game title "DIET SHOOTER"', () => {
    render(<DietShooter {...defaultProps} />);
    expect(screen.getByText('DIET SHOOTER')).toBeInTheDocument();
  });

  it('shows start button "ゲーム開始"', () => {
    render(<DietShooter {...defaultProps} />);
    expect(screen.getByText('ゲーム開始')).toBeInTheDocument();
  });

  it('shows close button (X icon) and clicking it calls onClose', () => {
    render(<DietShooter {...defaultProps} />);
    const closeButton = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows leaderboard section with ranking title', () => {
    render(<DietShooter {...defaultProps} />);
    expect(screen.getByText('🏆 ランキング')).toBeInTheDocument();
  });

  it('shows empty leaderboard state', async () => {
    render(<DietShooter {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('データなし')).toBeInTheDocument();
    });
  });

  it('shows leaderboard entries when data is available', async () => {
    const { getLeaderboard } = await import('@/lib/firebase/firestore');
    getLeaderboard.mockResolvedValue([
      { id: '1', userName: 'Player1', score: 5000 },
      { id: '2', userName: 'Player2', score: 3000 },
    ]);

    render(<DietShooter {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Player1')).toBeInTheDocument();
      expect(screen.getByText('5000')).toBeInTheDocument();
      expect(screen.getByText('Player2')).toBeInTheDocument();
    });
  });

  it('shows countdown after clicking start button', async () => {
    vi.useFakeTimers();
    render(<DietShooter {...defaultProps} />);

    fireEvent.click(screen.getByText('ゲーム開始'));

    // Should show countdown starting at 3
    expect(screen.getByText('3')).toBeInTheDocument();

    // Advance to 2
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('2')).toBeInTheDocument();

    // Advance to 1
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('1')).toBeInTheDocument();

    // Advance to GO!
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('GO!')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows diet status info on menu screen', () => {
    render(<DietShooter {...defaultProps} />);
    // The menu shows the food emoji matchup
    expect(screen.getByText('🥗 vs 🍔')).toBeInTheDocument();
    // Shows green/red ratio text
    expect(screen.getByText(/Good.*%/)).toBeInTheDocument();
    expect(screen.getByText(/Bad.*%/)).toBeInTheDocument();
  });

  it('shows score display with initial score of 0', () => {
    render(<DietShooter {...defaultProps} />);
    expect(screen.getByText('SCORE: 0')).toBeInTheDocument();
  });

  it('shows reset confirmation dialog when trash icon is clicked', () => {
    render(<DietShooter {...defaultProps} />);

    // Click the trash/reset button (there are Trash2 icons for reset)
    const trashButtons = screen.getAllByTestId('icon-Trash2');
    fireEvent.click(trashButtons[0].closest('button'));

    // Should show reset confirmation
    expect(screen.getByText('ランキングを全消去しますか？')).toBeInTheDocument();
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
    expect(screen.getByText('実行')).toBeInTheDocument();
  });

  it('reset confirmation cancel button hides the dialog', () => {
    render(<DietShooter {...defaultProps} />);

    // Open reset dialog
    const trashButtons = screen.getAllByTestId('icon-Trash2');
    fireEvent.click(trashButtons[0].closest('button'));

    expect(screen.getByText('ランキングを全消去しますか？')).toBeInTheDocument();

    // Click cancel
    fireEvent.click(screen.getByText('キャンセル'));

    // Dialog should be gone
    expect(screen.queryByText('ランキングを全消去しますか？')).not.toBeInTheDocument();
  });

  it('renders canvas element for the game', () => {
    const { container } = render(<DietShooter {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '400');
    expect(canvas).toHaveAttribute('height', '800');
  });
});
