import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ConditionCheckIn from '@/components/ConditionCheckIn';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

const mockGetConditionLog = vi.fn();
const mockSaveConditionCheckIn = vi.fn();
const mockSaveUserProfile = vi.fn();

vi.mock('@/lib/firebase/firestore', () => ({
  getConditionLog: (...args) => mockGetConditionLog(...args),
  saveConditionCheckIn: (...args) => mockSaveConditionCheckIn(...args),
  saveUserProfile: (...args) => mockSaveUserProfile(...args),
}));

const user = { uid: 'u1' };

/**
 * システム時刻を JST の壁時計時刻に固定する。
 * shouldAdvanceTime を付けないと findBy 系や waitFor のポーリングが進まずタイムアウトする。
 */
const setNow = (jstIso) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${jstIso}+09:00`));
};

describe('ConditionCheckIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConditionLog.mockResolvedValue(null);
    mockSaveConditionCheckIn.mockResolvedValue(undefined);
    mockSaveUserProfile.mockResolvedValue(undefined);
    // 集中力の設問が出る時間帯を既定にする
    setNow('2026-07-30T17:00:00');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing without a signed-in user', () => {
    const { container } = render(<ConditionCheckIn user={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('asks about last night and today once loaded', async () => {
    render(<ConditionCheckIn user={user} />);

    expect(await screen.findByText('昨夜はよく眠れましたか？')).toBeInTheDocument();
    expect(screen.getByText('今日の集中力はどうでしたか？')).toBeInTheDocument();
  });

  it('files the sleep answer under the day whose meals caused it', async () => {
    render(<ConditionCheckIn user={user} />);
    await screen.findByText('昨夜はよく眠れましたか？');

    // 7/30 17:00 → 昨夜の睡眠の原因は 7/29 の食事
    expect(mockGetConditionLog).toHaveBeenCalledWith('u1', '2026-07-29');
    // 集中力は当日 7/30
    expect(mockGetConditionLog).toHaveBeenCalledWith('u1', '2026-07-30');
  });

  it('saves a sleep answer to the previous day key', async () => {
    render(<ConditionCheckIn user={user} />);
    const group = await screen.findByRole('radiogroup', { name: '昨夜はよく眠れましたか？' });

    fireEvent.click(within(group).getByRole('radio', { name: 'よい' }));

    await waitFor(() => {
      expect(mockSaveConditionCheckIn).toHaveBeenCalledWith('u1', '2026-07-29', 'sleep', 4);
    });
  });

  it('saves a focus answer to the current logical day', async () => {
    render(<ConditionCheckIn user={user} />);
    const group = await screen.findByRole('radiogroup', { name: '今日の集中力はどうでしたか？' });

    fireEvent.click(within(group).getByRole('radio', { name: '最悪' }));

    await waitFor(() => {
      expect(mockSaveConditionCheckIn).toHaveBeenCalledWith('u1', '2026-07-30', 'focus', 1);
    });
  });

  it('hides the focus question in the morning (nothing to report yet)', async () => {
    setNow('2026-07-30T08:00:00');
    render(<ConditionCheckIn user={user} />);

    expect(await screen.findByText('昨夜はよく眠れましたか？')).toBeInTheDocument();
    expect(screen.queryByText('今日の集中力はどうでしたか？')).not.toBeInTheDocument();
    expect(screen.getByText(/集中力は夕方ごろに/)).toBeInTheDocument();
  });

  it('still shows a focus answer recorded earlier in the day', async () => {
    setNow('2026-07-30T08:00:00');
    mockGetConditionLog.mockImplementation((_uid, dateKey) =>
      Promise.resolve(dateKey === '2026-07-30' ? { focus: { subjective: 5 } } : null)
    );

    render(<ConditionCheckIn user={user} />);
    expect(await screen.findByText('今日の集中力はどうでしたか？')).toBeInTheDocument();
  });

  it('marks an already-answered scale as selected', async () => {
    mockGetConditionLog.mockImplementation((_uid, dateKey) =>
      Promise.resolve(dateKey === '2026-07-29' ? { sleep: { subjective: 2 } } : null)
    );

    render(<ConditionCheckIn user={user} />);
    const group = await screen.findByRole('radiogroup', { name: '昨夜はよく眠れましたか？' });

    expect(within(group).getByRole('radio', { name: 'いまいち' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: 'よい' })).toHaveAttribute('aria-checked', 'false');
  });

  it('rolls back the selection and warns when the save fails', async () => {
    mockSaveConditionCheckIn.mockRejectedValue(new Error('offline'));
    render(<ConditionCheckIn user={user} />);
    const group = await screen.findByRole('radiogroup', { name: '昨夜はよく眠れましたか？' });
    const option = within(group).getByRole('radio', { name: 'よい' });

    fireEvent.click(option);

    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました');
    expect(option).toHaveAttribute('aria-checked', 'false');
  });

  it('saves the sleep schedule used for late-meal detection', async () => {
    const onProfileUpdate = vi.fn();
    render(<ConditionCheckIn user={user} userProfile={{}} onProfileUpdate={onProfileUpdate} />);
    await screen.findByText('昨夜はよく眠れましたか？');

    fireEvent.click(screen.getByLabelText('生活リズム設定'));

    const bedtime = screen.getByLabelText(/就寝時刻/);
    expect(bedtime).toHaveValue('01:00'); // 0:00〜2:00 就寝の既定値

    fireEvent.change(bedtime, { target: { value: '02:00' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mockSaveUserProfile).toHaveBeenCalledWith('u1', { bedtime: '02:00', wakeTime: '08:00' });
    });
    expect(onProfileUpdate).toHaveBeenCalledWith({ bedtime: '02:00', wakeTime: '08:00' });
  });

  it('prefills the schedule from the saved profile', async () => {
    render(<ConditionCheckIn user={user} userProfile={{ bedtime: '23:30', wakeTime: '06:45' }} />);
    await screen.findByText('昨夜はよく眠れましたか？');

    fireEvent.click(screen.getByLabelText('生活リズム設定'));

    expect(screen.getByLabelText(/就寝時刻/)).toHaveValue('23:30');
    expect(screen.getByLabelText(/起床時刻/)).toHaveValue('06:45');
  });
});
