import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DrinkQuickLog from '@/components/DrinkQuickLog';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

const mockGetDrinkPresets = vi.fn();
const mockAddDrinkPreset = vi.fn();
const mockDeleteDrinkPreset = vi.fn();

vi.mock('@/lib/firebase/firestore', () => ({
  getDrinkPresets: (...args) => mockGetDrinkPresets(...args),
  addDrinkPreset: (...args) => mockAddDrinkPreset(...args),
  deleteDrinkPreset: (...args) => mockDeleteDrinkPreset(...args),
}));

const user = { uid: 'u1' };

describe('DrinkQuickLog', () => {
  let onLogDrink;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDrinkPresets.mockResolvedValue([]);
    mockAddDrinkPreset.mockResolvedValue('preset-1');
    mockDeleteDrinkPreset.mockResolvedValue(undefined);
    onLogDrink = vi.fn().mockResolvedValue(undefined);
  });

  it('renders nothing without a signed-in user', () => {
    const { container } = render(<DrinkQuickLog user={null} onLogDrink={onLogDrink} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the standard drinks', () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);
    expect(screen.getByText(/コーヒー（ブラック）/)).toBeInTheDocument();
    expect(screen.getByText(/エナジードリンク/)).toBeInTheDocument();
    expect(screen.getByText(/ビール（500ml）/)).toBeInTheDocument();
  });

  it('logs a drink with fixed caffeine instead of an AI estimate', async () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByText(/コーヒー（ブラック）/));

    await waitFor(() => expect(onLogDrink).toHaveBeenCalled());
    const meal = onLogDrink.mock.calls[0][0];
    expect(meal.foodName).toBe('コーヒー（ブラック）');
    expect(meal.macros.caffeine).toBe(90);
    expect(meal.mealType).toBe('snack');
  });

  it('records a true zero for drinks without caffeine or alcohol', async () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByText(/水・麦茶/));

    await waitFor(() => expect(onLogDrink).toHaveBeenCalled());
    const meal = onLogDrink.mock.calls[0][0];
    // 0 と null の区別が肝: 「含まない」ことが分かっているので 0 を入れる
    expect(meal.macros.caffeine).toBe(0);
    expect(meal.macros.alcohol).toBe(0);
  });

  it('records alcohol in grams for beer', async () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByText(/ビール（500ml）/));

    await waitFor(() => expect(onLogDrink).toHaveBeenCalled());
    expect(onLogDrink.mock.calls[0][0].macros.alcohol).toBe(20);
  });

  it('shows an error when logging fails', async () => {
    onLogDrink.mockRejectedValue(new Error('offline'));
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByText(/緑茶/));

    expect(await screen.findByRole('alert')).toHaveTextContent('記録に失敗しました');
  });

  it('loads and displays custom presets', async () => {
    mockGetDrinkPresets.mockResolvedValue([
      { id: 'p1', name: 'いつものコンビニコーヒー', calories: 10, macros: { caffeine: 120, alcohol: 0 } },
    ]);

    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    expect(await screen.findByText('いつものコンビニコーヒー')).toBeInTheDocument();
    expect(mockGetDrinkPresets).toHaveBeenCalledWith('u1');
  });

  it('registers a custom drink with explicit zeros for blank fields', async () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByLabelText('飲み物を登録'));
    fireEvent.change(screen.getByLabelText(/名前/), { target: { value: 'マイコーヒー' } });
    fireEvent.change(screen.getByLabelText(/カフェイン/), { target: { value: '120' } });
    fireEvent.click(screen.getByText('マイドリンクに登録'));

    await waitFor(() => expect(mockAddDrinkPreset).toHaveBeenCalled());
    const [, preset] = mockAddDrinkPreset.mock.calls[0];
    expect(preset.name).toBe('マイコーヒー');
    expect(preset.macros.caffeine).toBe(120);
    expect(preset.macros.alcohol).toBe(0);
    expect(preset.calories).toBe(0);
  });

  it('does not submit an unnamed preset', () => {
    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);

    fireEvent.click(screen.getByLabelText('飲み物を登録'));
    expect(screen.getByText('マイドリンクに登録')).toBeDisabled();
  });

  it('deletes a custom preset and restores it if the delete fails', async () => {
    mockGetDrinkPresets.mockResolvedValue([
      { id: 'p1', name: 'マイコーヒー', calories: 10, macros: { caffeine: 120 } },
    ]);
    mockDeleteDrinkPreset.mockRejectedValue(new Error('offline'));

    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);
    await screen.findByText('マイコーヒー');

    fireEvent.click(screen.getByLabelText('マイコーヒーを削除'));

    expect(await screen.findByRole('alert')).toHaveTextContent('削除に失敗しました');
    expect(screen.getByText('マイコーヒー')).toBeInTheDocument();
  });

  it('deletes a custom preset on success', async () => {
    mockGetDrinkPresets.mockResolvedValue([
      { id: 'p1', name: 'マイコーヒー', calories: 10, macros: { caffeine: 120 } },
    ]);

    render(<DrinkQuickLog user={user} onLogDrink={onLogDrink} />);
    await screen.findByText('マイコーヒー');

    fireEvent.click(screen.getByLabelText('マイコーヒーを削除'));

    await waitFor(() => expect(mockDeleteDrinkPreset).toHaveBeenCalledWith('u1', 'p1'));
    expect(screen.queryByText('マイコーヒー')).not.toBeInTheDocument();
  });
});
