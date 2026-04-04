import { render, screen, fireEvent } from '@testing-library/react';
import DietPlanWizard from '@/components/DietPlanWizard';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

describe('DietPlanWizard', () => {
  const defaultProps = {
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders first step', () => {
    render(<DietPlanWizard {...defaultProps} />);
    expect(screen.getByText('目標設定')).toBeInTheDocument();
    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();
  });

  it('shows gender selection on step 1', () => {
    render(<DietPlanWizard {...defaultProps} />);
    expect(screen.getByText('男性')).toBeInTheDocument();
    expect(screen.getByText('女性')).toBeInTheDocument();
  });

  it('shows age input on step 1', () => {
    render(<DietPlanWizard {...defaultProps} />);
    expect(screen.getByPlaceholderText('例: 30')).toBeInTheDocument();
  });

  it('advances to step 2 when next clicked', () => {
    render(<DietPlanWizard {...defaultProps} />);
    fireEvent.click(screen.getByText('次へ'));
    expect(screen.getByText('Step 2 / 3')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('170')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('60')).toBeInTheDocument();
  });

  it('advances to step 3 and shows save button', () => {
    render(<DietPlanWizard {...defaultProps} />);
    fireEvent.click(screen.getByText('次へ')); // -> step 2
    fireEvent.click(screen.getByText('次へ')); // -> step 3
    expect(screen.getByText('Step 3 / 3')).toBeInTheDocument();
    expect(screen.getByText('プランを作成')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('55')).toBeInTheDocument();
  });

  it('goes back from step 2 to step 1', () => {
    render(<DietPlanWizard {...defaultProps} />);
    fireEvent.click(screen.getByText('次へ'));
    fireEvent.click(screen.getByText('戻る'));
    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();
  });

  it('calls onComplete with profile on final step submit', () => {
    render(<DietPlanWizard {...defaultProps} />);

    // Step 1: fill age
    fireEvent.change(screen.getByPlaceholderText('例: 30'), { target: { value: '30', name: 'age' } });
    fireEvent.click(screen.getByText('次へ'));

    // Step 2: fill height and weight
    fireEvent.change(screen.getByPlaceholderText('170'), { target: { value: '170', name: 'height' } });
    fireEvent.change(screen.getByPlaceholderText('60'), { target: { value: '70', name: 'currentWeight' } });
    fireEvent.click(screen.getByText('次へ'));

    // Step 3: fill target weight
    fireEvent.change(screen.getByPlaceholderText('55'), { target: { value: '60', name: 'targetWeight' } });
    fireEvent.click(screen.getByText('プランを作成'));

    expect(defaultProps.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        age: '30',
        height: '170',
        currentWeight: '70',
        targetWeight: '60',
        targetCalories: expect.any(Number),
      })
    );
  });
});
