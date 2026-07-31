import { render, screen } from '@testing-library/react';
import ConditionTrendChart from '@/components/ConditionTrendChart';

vi.mock('recharts', () => ({
  LineChart: (props) => <div data-testid="chart" data-points={JSON.stringify(props.data)}>{props.children}</div>,
  Line: (props) => <div data-testid={`line-${props.dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: (props) => <div>{props.children}</div>,
}));

const chartData = () => JSON.parse(screen.getByTestId('chart').dataset.points);

const log = (date, predicted, subjective) => ({
  date,
  predicted: { sleep: predicted },
  sleep: subjective == null ? {} : { subjective },
});

describe('ConditionTrendChart', () => {
  it('データが無いときは案内を出す', () => {
    render(<ConditionTrendChart logs={[]} />);
    expect(screen.getByText(/まだ推移を出せるデータがありません/)).toBeInTheDocument();
  });

  it('予測と実測の2本を描く', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, 2)]} />);
    expect(screen.getByTestId('line-predicted')).toBeInTheDocument();
    expect(screen.getByTestId('line-actual')).toBeInTheDocument();
  });

  it('主観1-5 を 0-100 に揃えて重ねる', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, 2)]} />);
    const [point] = chartData();
    expect(point.predicted).toBe(38);
    expect(point.actual).toBe(40); // 2 × 20
  });

  it('日付の昇順に並べ替える', () => {
    render(<ConditionTrendChart logs={[log('2026-07-30', 50, 3), log('2026-07-28', 40, 2)]} />);
    expect(chartData().map(d => d.date)).toEqual(['7/28', '7/30']);
  });

  it('未回答の日は実測を null にする（0 として描かない）', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, null)]} />);
    expect(chartData()[0].actual).toBeNull();
  });

  it('予測も実測も無い日は点にしない', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, 2), { date: '2026-07-30', predicted: {}, sleep: {} }]} />);
    expect(chartData()).toHaveLength(1);
  });

  it('データが少ないうちは「あと何日で見えてくるか」を伝える', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, 2)]} />);
    expect(screen.getByText(/あと\d+日ぶんくらい揃うと/)).toBeInTheDocument();
  });

  it('十分揃ったら調整していく旨を伝える', () => {
    const logs = Array.from({ length: 15 }, (_, i) =>
      log(`2026-07-${String(i + 1).padStart(2, '0')}`, 40 + i, 3));
    render(<ConditionTrendChart logs={logs} />);
    expect(screen.getByText(/重みを調整していきます/)).toBeInTheDocument();
  });

  it('軸を切り替えられる', () => {
    const logs = [{ date: '2026-07-29', predicted: { focus: 72 }, focus: { subjective: 4 } }];
    render(<ConditionTrendChart logs={logs} axis="focus" />);
    const [point] = chartData();
    expect(point.predicted).toBe(72);
    expect(point.actual).toBe(80);
  });

  it('date が壊れたログは無視する', () => {
    render(<ConditionTrendChart logs={[log('2026-07-29', 38, 2), { predicted: { sleep: 50 } }]} />);
    expect(chartData()).toHaveLength(1);
  });
});
