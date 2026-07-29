import { render, screen, fireEvent } from '@testing-library/react';
import ConditionCard from '@/components/ConditionCard';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

const axis = (score, confidence = 'high', drivers = []) => ({
  score,
  grade: score >= 70 ? 'good' : score >= 55 ? 'normal' : 'warn',
  confidence,
  drivers,
});

const scoredResult = {
  date: '2026-07-29',
  axes: {
    focus: axis(72),
    sleep: axis(38, 'high', [{ key: 'caffeine_late', label: '午後以降のカフェイン', delta: -12 }]),
    energy: axis(61),
    mood: axis(65),
  },
  topNegative: { axis: 'sleep', key: 'caffeine_late', label: '午後以降のカフェイン', delta: -12 },
  topPositive: { axis: 'focus', key: 'breakfast_protein', label: '朝食のタンパク質', delta: 8 },
  version: 1,
};

const emptyResult = {
  date: '2026-07-29',
  axes: {
    focus: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
    sleep: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
    energy: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
    mood: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
  },
  topNegative: null,
  topPositive: null,
  version: 1,
};

describe('ConditionCard', () => {
  it('renders nothing without a result', () => {
    const { container } = render(<ConditionCard result={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows all four axis scores', () => {
    render(<ConditionCard result={scoredResult} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('集中力')).toBeInTheDocument();
    expect(screen.getByText('睡眠')).toBeInTheDocument();
  });

  it('never shows a number when the data is insufficient', () => {
    render(<ConditionCard result={emptyResult} />);
    // ゲージごと出さず、次の行動を促すメッセージだけを見せる
    expect(screen.getByText(/まだ判定できません/)).toBeInTheDocument();
    expect(screen.queryByText('集中力')).not.toBeInTheDocument();
  });

  it('shows a dash for a single insufficient axis while others are scored', () => {
    const mixed = {
      ...scoredResult,
      axes: { ...scoredResult.axes, mood: { score: null, grade: null, confidence: 'insufficient', drivers: [] } },
    };
    render(<ConditionCard result={mixed} />);
    expect(screen.getByText('―')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('hides the detail link when there is nothing to explain', () => {
    render(<ConditionCard result={emptyResult} />);
    expect(screen.queryByText('詳しく')).not.toBeInTheDocument();
  });

  it('explains the biggest factor rather than showing bare numbers', () => {
    render(<ConditionCard result={scoredResult} />);
    expect(screen.getByText(/午後以降のカフェイン/)).toBeInTheDocument();
  });

  it('praises the positive factor when nothing is dragging the score down', () => {
    render(<ConditionCard result={{ ...scoredResult, topNegative: null }} />);
    expect(screen.getByText(/朝食のタンパク質/)).toBeInTheDocument();
  });

  it('opens the detail view', () => {
    const onOpenDetail = vi.fn();
    render(<ConditionCard result={scoredResult} onOpenDetail={onOpenDetail} />);

    fireEvent.click(screen.getByText('詳しく'));
    expect(onOpenDetail).toHaveBeenCalled();
  });

  it('marks low-confidence axes as a reference value', () => {
    const result = { ...scoredResult, axes: { ...scoredResult.axes, sleep: axis(38, 'low') } };
    render(<ConditionCard result={result} />);
    expect(screen.getByText('参考値')).toBeInTheDocument();
  });

  it('nudges for a bedtime when it is not set yet', () => {
    const onRequestBedtime = vi.fn();
    render(<ConditionCard result={scoredResult} needsBedtime onRequestBedtime={onRequestBedtime} />);

    const nudge = screen.getByText(/就寝時刻を設定すると/);
    fireEvent.click(nudge);
    expect(onRequestBedtime).toHaveBeenCalled();
  });

  it('hides the nudge once a bedtime exists', () => {
    render(<ConditionCard result={scoredResult} needsBedtime={false} />);
    expect(screen.queryByText(/就寝時刻を設定すると/)).not.toBeInTheDocument();
  });

  it('always states that this is not a medical diagnosis', () => {
    render(<ConditionCard result={scoredResult} />);
    expect(screen.getByText(/医学的な診断ではありません/)).toBeInTheDocument();
  });
});
