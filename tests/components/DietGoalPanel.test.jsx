import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DietGoalPanel from '@/components/DietGoalPanel';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

vi.mock('recharts', () => ({
  LineChart: (props) => <div data-testid="chart">{props.children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: (props) => <div>{props.children}</div>,
  ReferenceLine: () => null,
  ReferenceArea: () => null,
}));

const mockSaveUserProfile = vi.fn().mockResolvedValue(undefined);
const mockAddWeightToFirestore = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/firebase/firestore', () => ({
  saveUserProfile: (...args) => mockSaveUserProfile(...args),
  addWeightToFirestore: (...args) => mockAddWeightToFirestore(...args),
}));

const mockAnalyzeGoalFeasibility = vi.fn().mockResolvedValue({
  feasibility: 'Realistic',
  reasoning: '目標達成は十分に可能です',
  recommended_daily_calories: 1800,
});

vi.mock('@/app/actions/daily-evaluation', () => ({
  analyzeGoalFeasibility: (...args) => mockAnalyzeGoalFeasibility(...args),
}));

describe('DietGoalPanel', () => {
  const weights = [
    { date: '2026-04-01', weight: 70.5 },
    { date: '2026-03-31', weight: 70.8 },
    { date: '2026-03-30', weight: 71.0 },
  ];

  const defaultProps = {
    user: { uid: 'test-user' },
    userProfile: { targetWeight: '65', targetDate: '2026-06-01', height: '170', targetBMI: '22' },
    weights,
    activeDate: '2026-04-01',
    onClose: vi.fn(),
    onUpdateWeights: vi.fn(),
  };

  let alertSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ===== 1. Basic Rendering =====

  it('renders the panel title', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('ダイエット目標')).toBeInTheDocument();
  });

  // 体重の手入力は廃止した。体組成計 → ヘルスケア → API で自動的に入るため、
  // 手入力で体重だけ上書きすると体脂肪率などの導出値と食い違う
  it('does not offer manual weight entry', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.queryByText('記録')).not.toBeInTheDocument();
  });

  it('renders goal settings section with target weight input', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('目標設定')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('60.0')).toBeInTheDocument();
  });

  it('renders Elena Proposal section', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText("Elena's Proposal")).toBeInTheDocument();
  });

  it('renders with empty weights array without crashing', () => {
    render(<DietGoalPanel {...defaultProps} weights={[]} />);
    expect(screen.getByText('ダイエット目標')).toBeInTheDocument();
  });

  // ===== 2. Current Weight Display =====

  it('shows current weight from weights array (first entry = latest)', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('70.5')).toBeInTheDocument();
  });

  it('shows "-" for current weight when weights array is empty', () => {
    render(<DietGoalPanel {...defaultProps} weights={[]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  // ===== 3. Weight Remaining Calculation =====

  it('shows remaining kg until goal (70.5 - 65 = 5.5)', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('-5.5')).toBeInTheDocument();
  });

  it('shows "+0" when current weight is below target (goal achieved)', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 64 }]} />);
    expect(screen.getByText('+0')).toBeInTheDocument();
  });

  it('shows "+0" when current weight equals target', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 65 }]} />);
    // 65 - 65 = 0.0, which is not > 0, so "+0"
    expect(screen.getByText('+0')).toBeInTheDocument();
  });

  it('does not show remaining section when targetWeight is not set', () => {
    const props = {
      ...defaultProps,
      userProfile: { ...defaultProps.userProfile, targetWeight: '' },
    };
    render(<DietGoalPanel {...props} />);
    expect(screen.queryByText('目標まで')).not.toBeInTheDocument();
  });

  // ===== 4. BMI Display - All 5 Categories =====

  it('shows 低体重 for underweight BMI (height=170, weight=50 -> BMI 17.3)', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 50 }]} />);
    const bmiTexts = screen.getAllByText('17.3');
    expect(bmiTexts.length).toBeGreaterThan(0);
    expect(screen.getAllByText('低体重').length).toBeGreaterThan(0);
  });

  it('shows 普通体重 for normal BMI (height=170, weight=70.5 -> BMI 24.4)', () => {
    render(<DietGoalPanel {...defaultProps} />);
    const bmiTexts = screen.getAllByText('24.4');
    expect(bmiTexts.length).toBeGreaterThan(0);
    expect(screen.getAllByText('普通体重').length).toBeGreaterThan(0);
  });

  it('shows 肥満(1度) for BMI 25-30 (height=170, weight=80 -> BMI 27.7)', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 80 }]} />);
    expect(screen.getAllByText('27.7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('肥満(1度)').length).toBeGreaterThan(0);
  });

  it('shows 肥満(2度) for BMI 30-35 (height=170, weight=95 -> BMI 32.9)', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 95 }]} />);
    expect(screen.getAllByText('32.9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('肥満(2度)').length).toBeGreaterThan(0);
  });

  it('shows 肥満(3度以上) for BMI >= 35 (height=170, weight=110 -> BMI 38.1)', () => {
    render(<DietGoalPanel {...defaultProps} weights={[{ date: '2026-04-01', weight: 110 }]} />);
    expect(screen.getAllByText('38.1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('肥満(3度以上)').length).toBeGreaterThan(0);
  });

  // ===== 5. BMI Not Shown When Height Empty =====

  it('does not display BMI card when height is not set', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, height: '' }} />);
    expect(screen.queryByText('BMI')).not.toBeInTheDocument();
  });

  it('does not display BMI card when height is missing from userProfile', () => {
    const { targetWeight, targetDate, targetBMI } = defaultProps.userProfile;
    render(<DietGoalPanel {...defaultProps} userProfile={{ targetWeight, targetDate, targetBMI }} />);
    expect(screen.queryByText('BMI')).not.toBeInTheDocument();
  });

  // ===== 7b. Target Calories =====
  // 以前はエレナの診断直後にしか編集できず、保存すると入力欄ごと消えていた

  it('lets the target calories be edited without running a diagnosis first', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetCalories: 2000 }} />);

    const input = screen.getByPlaceholderText('2000');
    expect(input.value).toBe('2000');
  });

  it('saves an edited target calorie value with the goal', async () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetCalories: 2000 }} />);

    fireEvent.change(screen.getByPlaceholderText('2000'), { target: { value: '1800' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mockSaveUserProfile).toHaveBeenCalledWith('test-user', expect.objectContaining({
        targetCalories: 1800,
      }));
    });
  });

  it('does not wipe the existing target calories when the field is cleared', async () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetCalories: 2000 }} />);

    fireEvent.change(screen.getByPlaceholderText('2000'), { target: { value: '' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mockSaveUserProfile).toHaveBeenCalled();
    });
    const [, payload] = mockSaveUserProfile.mock.calls[0];
    expect(payload).not.toHaveProperty('targetCalories');
  });

  // ===== 8. Goal Settings Save =====

  it('saves goal settings when save button is clicked', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mockSaveUserProfile).toHaveBeenCalledWith('test-user', {
        targetWeight: 65,
        targetDate: '2026-06-01',
        height: 170,
        targetBMI: 22,
        // 進捗率の分母になる開始体重。未設定なら目標を立てた時点の体重を記録する
        startWeight: 70.5,
      });
    });
  });

  it('calls onUpdateWeights after saving goal', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(defaultProps.onUpdateWeights).toHaveBeenCalled();
    });
  });

  it('shows success alert after saving goal', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('目標を保存しました');
    });
  });

  it('shows error alert when goal save fails', async () => {
    mockSaveUserProfile.mockRejectedValueOnce(new Error('save failed'));
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('保存に失敗しました');
    });
  });

  it('does not save goal when user is null', () => {
    render(<DietGoalPanel {...defaultProps} user={null} />);
    fireEvent.click(screen.getByText('保存'));
    expect(mockSaveUserProfile).not.toHaveBeenCalled();
  });

  // ===== 9. Analysis Trigger =====

  it('shows diagnosis start button when no analysis result', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('診断を開始する')).toBeInTheDocument();
  });

  it('calls analyzeGoalFeasibility with correct params when diagnosis button clicked', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(mockAnalyzeGoalFeasibility).toHaveBeenCalledWith({
        currentWeight: 70.5,
        targetWeight: 65,
        targetDate: '2026-06-01',
        height: 170,
        recentCalories: null,
        streakDays: 0,
      });
    });
  });

  it('passes recentCalories and streakDays props to analyzeGoalFeasibility', async () => {
    render(<DietGoalPanel {...defaultProps} recentCalories={2000} streakDays={5} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(mockAnalyzeGoalFeasibility).toHaveBeenCalledWith(
        expect.objectContaining({ recentCalories: 2000, streakDays: 5 })
      );
    });
  });

  it('shows alert when analysis is triggered without required fields', async () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ height: '170' }} weights={[]} />);
    // No currentWeight, no targetWeight, no targetDate -> should alert
    // The button should be disabled, but handleAnalyzeGoal also has an alert guard
    // Since button is disabled when !targetWeight || !targetDate, let's test the alert guard
    // by setting targetWeight and targetDate but having no weights (currentWeight = null)
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile }} weights={[]} />);
    // Diagnosis button is still enabled (targetWeight and targetDate are set)
    const diagBtns = screen.getAllByText('診断を開始する');
    // Click the last one (from second render)
    fireEvent.click(diagBtns[diagBtns.length - 1]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('現在の体重、目標体重、目標日を設定してください。');
    });
  });

  it('diagnosis button is disabled when targetWeight is empty', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetWeight: '' }} />);
    const diagBtn = screen.getByText('診断を開始する');
    expect(diagBtn.closest('button')).toBeDisabled();
  });

  it('diagnosis button is disabled when targetDate is empty', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetDate: '' }} />);
    const diagBtn = screen.getByText('診断を開始する');
    expect(diagBtn.closest('button')).toBeDisabled();
  });

  // ===== 10. Analysis Result Display =====

  it('displays Realistic feasibility badge after diagnosis', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText(/適正ライン/)).toBeInTheDocument();
    });
  });

  it('displays reasoning text from analysis result', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText(/目標達成は十分に可能です/)).toBeInTheDocument();
    });
  });

  it('displays Impossible badge text', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Impossible', reasoning: '無理です', recommended_daily_calories: 1200 },
    }} />);
    expect(screen.getByText(/無理ゲー/)).toBeInTheDocument();
  });

  it('displays Strict badge text', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Strict', reasoning: 'ペースが厳しいです', recommended_daily_calories: 1500 },
    }} />);
    expect(screen.getByText(/かなり厳しい/)).toBeInTheDocument();
  });

  it('displays Easy badge text', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Easy', reasoning: '余裕です', recommended_daily_calories: 2200 },
    }} />);
    expect(screen.getByText(/判定: 余裕/)).toBeInTheDocument();
  });

  // ===== 11. Calorie Recommendation Display =====

  it('shows recommended calorie input from analysis result', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText('推奨摂取カロリー')).toBeInTheDocument();
    });
    // The calorie input should have value 1800
    const calorieInput = screen.getByDisplayValue('1800');
    expect(calorieInput).toBeInTheDocument();
  });

  it('allows editing recommended calorie value', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('1800')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('1800'), { target: { value: '1600' } });
    expect(screen.getByDisplayValue('1600')).toBeInTheDocument();
  });

  it('shows pre-loaded recommended calories from lastDiagnosis', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Realistic', reasoning: 'テスト', recommended_daily_calories: 1700 },
    }} />);
    expect(screen.getByDisplayValue('1700')).toBeInTheDocument();
  });

  // ===== 12. Save Analysis to Profile =====

  it('saves analysis result to profile when "目標に設定" is clicked', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText('目標に設定')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('目標に設定'));

    await waitFor(() => {
      // First call is from handleAnalyzeGoal saving lastDiagnosis
      // Second call is from handleSaveAnalysisResult saving goal + calories
      expect(mockSaveUserProfile).toHaveBeenCalledWith('test-user', expect.objectContaining({
        targetCalories: 1800,
      }));
    });
  });

  it('calls onUpdateWeights and onClose after saving analysis result', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText('目標に設定')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('目標に設定'));

    await waitFor(() => {
      expect(defaultProps.onUpdateWeights).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('shows success alert after saving analysis result', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText('目標に設定')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('目標に設定'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('目標と摂取カロリー目安を保存しました'));
    });
  });

  // ===== 13. Close Analysis Result =====

  it('hides analysis result when "閉じる" button in analysis section is clicked', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(screen.getByText(/適正ライン/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('閉じる'));

    await waitFor(() => {
      // After closing, the diagnosis start button should reappear
      expect(screen.getByText('診断を開始する')).toBeInTheDocument();
    });
    expect(screen.queryByText(/適正ライン/)).not.toBeInTheDocument();
  });

  // ===== 14. Pre-loaded Diagnosis from userProfile =====

  it('shows pre-loaded diagnosis from userProfile.lastDiagnosis', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Strict', reasoning: 'ペースが厳しいです', recommended_daily_calories: 1500 },
    }} />);
    expect(screen.getByText(/かなり厳しい/)).toBeInTheDocument();
    expect(screen.getByText(/ペースが厳しいです/)).toBeInTheDocument();
  });

  it('shows re-diagnosis button when lastDiagnosis is pre-loaded', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Realistic', reasoning: 'テスト', recommended_daily_calories: 1800 },
    }} />);
    expect(screen.getByText('再診断')).toBeInTheDocument();
  });

  // ===== 15. Target BMI Weight Calculation =====

  it('shows target BMI weight (BMI 22, height 170 -> 63.6kg)', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText(/63.6/)).toBeInTheDocument();
  });

  it('does not show target BMI section when height is empty', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, height: '' }} />);
    expect(screen.queryByText('目標BMI:')).not.toBeInTheDocument();
  });

  it('shows target BMI weight for different BMI values', () => {
    // BMI 20, height 170 -> 20 * 1.7 * 1.7 = 57.8
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetBMI: '20' }} />);
    expect(screen.getByText(/57.8/)).toBeInTheDocument();
  });

  // ===== 16. Chart Renders =====

  it('renders the chart component', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('renders chart even with empty weights', () => {
    render(<DietGoalPanel {...defaultProps} weights={[]} />);
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  // ===== 17. (閉じるボタンは BodyDetailModal が持つ) =====

  // ===== 18. Days Remaining =====

  it('shows days remaining when target date is in the future', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText('期限まで')).toBeInTheDocument();
    // The actual number depends on current date vs target date
  });

  it('does not show days remaining when targetDate is empty', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetDate: '' }} />);
    expect(screen.queryByText('期限まで')).not.toBeInTheDocument();
  });

  it('shows 0 days when target date is in the past', () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetDate: '2020-01-01' }} />);
    // daysRemaining <= 0 so it shows 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // ===== 19. Height Input Changes Trigger BMI Recalculation =====

  it('updates BMI when height input changes', () => {
    render(<DietGoalPanel {...defaultProps} />);
    const heightInput = screen.getByPlaceholderText('170');
    expect(heightInput.value).toBe('170');

    // Change height to 180 -> BMI = 70.5 / (1.8 * 1.8) = 70.5 / 3.24 = 21.8
    fireEvent.change(heightInput, { target: { value: '180' } });

    expect(screen.getAllByText('21.8').length).toBeGreaterThan(0);
  });

  // ===== 20. Goal Settings Form Inputs =====

  it('renders height input with value from userProfile', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText('170').value).toBe('170');
  });

  it('renders target weight input with value from userProfile', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText('60.0').value).toBe('65');
  });

  it('renders target BMI select with default value', () => {
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByDisplayValue('22 (標準)')).toBeInTheDocument();
  });

  it('allows changing target BMI select', () => {
    render(<DietGoalPanel {...defaultProps} />);
    const select = screen.getByDisplayValue('22 (標準)');
    fireEvent.change(select, { target: { value: '20' } });
    expect(screen.getByDisplayValue('20 (美容体重)')).toBeInTheDocument();
  });

  it('shows target weight BMI hint when height and targetWeight set', () => {
    // targetWeight=65, height=170 -> BMI = 65 / (1.7*1.7) = 22.5
    render(<DietGoalPanel {...defaultProps} />);
    expect(screen.getByText(/→ BMI 22.5/)).toBeInTheDocument();
  });

  // ===== 21. Error Handling =====

  it('shows error alert when analysis fails with error result', async () => {
    mockAnalyzeGoalFeasibility.mockResolvedValueOnce({ error: '分析エラー' });
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('分析に失敗しました'));
    });
  });

  it('shows error alert when analysis throws an exception', async () => {
    mockAnalyzeGoalFeasibility.mockRejectedValueOnce(new Error('network error'));
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('エラーが発生しました');
    });
  });

  it('shows error alert when saving analysis result fails', async () => {
    render(<DietGoalPanel {...defaultProps} userProfile={{
      ...defaultProps.userProfile,
      lastDiagnosis: { feasibility: 'Realistic', reasoning: 'テスト', recommended_daily_calories: 1800 },
    }} />);

    mockSaveUserProfile.mockRejectedValueOnce(new Error('save failed'));
    fireEvent.click(screen.getByText('目標に設定'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('保存に失敗しました');
    });
  });

  // ===== 22. Required Pace =====

  it('shows required pace when all conditions are met', () => {
    // currentWeight=70.5, targetWeight=65, remainingKg=5.5
    // targetDate must be in the future for daysRemaining > 0
    render(<DietGoalPanel {...defaultProps} userProfile={{ ...defaultProps.userProfile, targetDate: '2027-12-31' }} />);
    expect(screen.getByText('必要ペース')).toBeInTheDocument();
  });

  // ===== 24. Analysis saves lastDiagnosis to Firestore =====

  it('saves lastDiagnosis to Firestore after successful analysis', async () => {
    render(<DietGoalPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('診断を開始する'));

    await waitFor(() => {
      expect(mockSaveUserProfile).toHaveBeenCalledWith('test-user', {
        lastDiagnosis: expect.objectContaining({
          feasibility: 'Realistic',
          reasoning: '目標達成は十分に可能です',
          recommended_daily_calories: 1800,
        }),
      });
    });
  });
});
