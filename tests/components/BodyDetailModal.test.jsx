import { render, screen, fireEvent } from '@testing-library/react';
import BodyDetailModal from '@/components/BodyDetailModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

// 目標パネルは Server Action と Firestore を呼ぶので、ここでは中身を見ない。
// このテストの関心は「実測と目標が1つの画面に並ぶこと」
vi.mock('@/components/DietGoalPanel', () => ({
  default: (props) => <div data-testid="diet-goal-panel" data-weights={props.weights?.length ?? 0} />,
}));

const defaultProps = {
  user: { uid: 'test-user' },
  userProfile: { targetWeight: 75 },
  weights: [{ date: '2026-08-01', weight: 83.4, bodyFat: 25.8 }],
  activity: { steps: 7864, activeEnergy: 304 },
  body: { weight: 83.4, bodyFat: 25.8 },
  sleep: { asleepMinutes: 402, sleepEnd: '2026-08-01T22:00:00.000Z' },
  workouts: [],
  onClose: vi.fn(),
  onUpdateWeights: vi.fn(),
};

describe('BodyDetailModal', () => {
  it('shows the measured values and the diet goal together', () => {
    render(<BodyDetailModal {...defaultProps} />);

    // 実測（ActivityCard）
    expect(screen.getByText('7,864')).toBeInTheDocument();
    expect(screen.getByText('今日の実測')).toBeInTheDocument();
    // 目標（DietGoalPanel）
    expect(screen.getByTestId('diet-goal-panel')).toBeInTheDocument();
  });

  it('uses the title it is given', () => {
    render(<BodyDetailModal {...defaultProps} title="この日のからだ" />);

    expect(screen.getByText('この日のからだ')).toBeInTheDocument();
  });

  it('closes when the X button is clicked', () => {
    const onClose = vi.fn();
    render(<BodyDetailModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('閉じる'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes the weight history through to the goal panel for the trend chart', () => {
    render(<BodyDetailModal {...defaultProps} />);

    expect(screen.getByTestId('diet-goal-panel')).toHaveAttribute('data-weights', '1');
  });

  it('still renders the goal panel when no health data arrived that day', () => {
    render(<BodyDetailModal {...defaultProps} activity={null} body={null} sleep={null} />);

    // 実測が無い日でも目標の設定はできる必要がある
    expect(screen.getByTestId('diet-goal-panel')).toBeInTheDocument();
  });
});
