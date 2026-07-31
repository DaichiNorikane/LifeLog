import { render, screen, fireEvent } from '@testing-library/react';
import ConditionModal from '@/components/ConditionModal';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

const result = {
  date: '2026-07-29',
  axes: {
    focus: {
      score: 72, grade: 'good', confidence: 'high',
      drivers: [
        { key: 'breakfast_protein', label: '朝食のタンパク質', delta: 8, detail: '朝食で25g' },
        { key: 'iron_low', label: '鉄が不足気味', delta: -6, detail: '3mg' },
      ],
    },
    sleep: {
      score: 38, grade: 'bad', confidence: 'low',
      drivers: [{ key: 'caffeine_late', label: '午後以降のカフェイン', delta: -12, detail: '14時以降に1回' }],
    },
    energy: { score: 60, grade: 'normal', confidence: 'medium', drivers: [] },
    mood: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
  },
  version: 1,
};

describe('ConditionModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ConditionModal isOpen={false} result={result} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing without a result', () => {
    const { container } = render(<ConditionModal isOpen result={null} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows every axis with its score', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('エネルギー')).toBeInTheDocument();
  });

  it('discloses why each score is what it is', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText('朝食のタンパク質')).toBeInTheDocument();
    expect(screen.getByText('+8')).toBeInTheDocument();
    expect(screen.getByText('鉄が不足気味')).toBeInTheDocument();
    expect(screen.getByText('-6')).toBeInTheDocument();
  });

  it('shows the concrete detail behind a driver', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText(/朝食で25g/)).toBeInTheDocument();
  });

  it('flags a low-confidence axis as a reference value', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText('参考値')).toBeInTheDocument();
  });

  it('never shows a score for an insufficient axis', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText('まだ判定できません')).toBeInTheDocument();
    expect(screen.getByText(/記録が増えると判定できる/)).toBeInTheDocument();
  });

  it('says so plainly when an axis has no notable drivers', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText(/特に大きな要因はありません/)).toBeInTheDocument();
  });

  it('carries the medical disclaimer', () => {
    render(<ConditionModal isOpen result={result} onClose={vi.fn()} />);
    expect(screen.getByText(/医学的な診断ではありません/)).toBeInTheDocument();
    expect(screen.getByText(/お医者さんに相談/)).toBeInTheDocument();
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    render(<ConditionModal isOpen result={result} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the overlay is clicked but not the panel', () => {
    const onClose = vi.fn();
    const { container } = render(<ConditionModal isOpen result={result} onClose={onClose} />);

    fireEvent.click(screen.getByText('コンディションの内訳'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});
