import { render, screen, fireEvent } from '@testing-library/react';
import ActivityCard from '@/components/ActivityCard';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

describe('ActivityCard', () => {
  it('renders nothing when no health data arrived that day', () => {
    const { container } = render(<ActivityCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every metric is null (not measured)', () => {
    const { container } = render(
      <ActivityCard activity={{ steps: null, activeEnergy: null }} body={{ weight: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a real zero rather than hiding the day', () => {
    render(<ActivityCard activity={{ steps: 0 }} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('歩数')).toBeInTheDocument();
  });

  it('shows primary activity metrics with separators', () => {
    render(<ActivityCard activity={{ steps: 8421, activeEnergy: 412, distanceKm: 6.2 }} />);

    expect(screen.getByText('8,421')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('6.20')).toBeInTheDocument();
  });

  it('shows measured sleep with its label and time range', () => {
    render(<ActivityCard sleep={{
      asleepMinutes: 402,
      sleepStart: '2026-07-30T16:10:00.000Z',
      sleepEnd: '2026-07-30T22:52:00.000Z',
    }} />);

    expect(screen.getByText('昨夜の睡眠')).toBeInTheDocument();
    expect(screen.getByText('6時間42分')).toBeInTheDocument();
  });

  it('falls back to time in bed when asleep minutes are missing', () => {
    render(<ActivityCard sleep={{ asleepMinutes: null, inBedMinutes: 480, sleepEnd: '2026-07-30T22:52:00.000Z' }} />);

    expect(screen.getByText('8時間0分')).toBeInTheDocument();
  });

  it('shows body composition including the derived fat mass', () => {
    render(<ActivityCard body={{ weight: 82.6, bodyFat: 25.8, bmi: 26.3, leanBodyMass: 61.3 }} />);

    expect(screen.getByText('体脂肪率')).toBeInTheDocument();
    expect(screen.getByText('25.8')).toBeInTheDocument();
    expect(screen.getByText('BMI')).toBeInTheDocument();
    expect(screen.getByText('除脂肪体重')).toBeInTheDocument();
    // 体脂肪量は保存されていない導出値（82.6kg × 25.8% = 21.31kg）
    expect(screen.getByText('体脂肪量')).toBeInTheDocument();
    expect(screen.getByText('21.31')).toBeInTheDocument();
  });

  it('omits body metrics that were not measured', () => {
    render(<ActivityCard body={{ weight: 82.6, bodyFat: null, bmi: null, leanBodyMass: null }} />);

    expect(screen.getByText('体重')).toBeInTheDocument();
    expect(screen.queryByText('体脂肪率')).not.toBeInTheDocument();
    expect(screen.queryByText('体脂肪量')).not.toBeInTheDocument();
  });

  it('lists workouts of the day', () => {
    render(<ActivityCard workouts={[
      { id: 'w1', type: 'running', typeLabel: 'ランニング', durationMinutes: 35, distanceKm: 5.1, activeEnergy: 310 },
    ]} />);

    expect(screen.getByText('ランニング')).toBeInTheDocument();
    expect(screen.getByText('35分')).toBeInTheDocument();
    expect(screen.getByText('5.1km')).toBeInTheDocument();
    expect(screen.getByText('310kcal')).toBeInTheDocument();
  });

  it('keeps secondary metrics collapsed until asked', () => {
    render(<ActivityCard activity={{ steps: 100, walkingSpeed: 4.2, stepLength: 73 }} />);

    expect(screen.queryByText('歩行速度')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/ほかの記録/));

    expect(screen.getByText('歩行速度')).toBeInTheDocument();
    expect(screen.getByText('歩幅')).toBeInTheDocument();
  });

  it('uses the title and sleep label it is given for past days', () => {
    render(<ActivityCard
      title="この日のからだ"
      sleepLabel="この日の夜の睡眠"
      sleep={{ asleepMinutes: 300, sleepEnd: '2026-07-25T22:00:00.000Z' }}
    />);

    expect(screen.getByText('この日のからだ')).toBeInTheDocument();
    expect(screen.getByText('この日の夜の睡眠')).toBeInTheDocument();
  });
});
