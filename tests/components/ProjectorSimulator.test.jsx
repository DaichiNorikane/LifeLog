import { render, screen, fireEvent } from '@testing-library/react';
import ProjectorSimulator from '@/components/ProjectorSimulator';

vi.mock('lucide-react', () => require('../mocks/lucide-react'));

// 入力条件は localStorage に保存されるので、テストごとにリセットする
beforeEach(() => {
  window.localStorage.clear();
});

const setNumber = (label, value) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('ProjectorSimulator', () => {
  it('見出しと初期状態の結果を表示する', () => {
    const { container } = render(<ProjectorSimulator />);
    expect(screen.getByText('投写シミュレーター')).toBeInTheDocument();
    // 既定値: 投写距離3m / スローレシオ1.35 → 約100インチ
    expect(container.textContent).toContain('100.4');
    expect(container.textContent).toContain('インチ');
  });

  it('投写距離を変えると画面サイズが変わる', () => {
    const { container } = render(<ProjectorSimulator />);
    setNumber('投写距離（レンズ〜スクリーン）', '4');
    // 幅 = 4 / 1.35 = 2.963m
    expect(container.textContent).toContain('296.3');
  });

  it('サイズ→距離モードに切り替えると必要な距離を表示する', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: 'サイズ → 距離' }));
    expect(screen.getByLabelText('ほしい画面サイズ（対角）')).toBeInTheDocument();
    // 100インチ(幅2.2136m) × 1.35 = 2.99m
    expect(container.textContent).toContain('2.99');
  });

  it('機種を変えるとスローレシオが切り替わる', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: '超短焦点（レーザーTV）' }));
    expect(container.textContent).toContain('0.25〜0.25');
    expect(container.textContent).toContain('単焦点レンズのため');
  });

  it('機種を変えても画面サイズを保つように投写距離を引き直す', () => {
    render(<ProjectorSimulator />);
    // 既定: 3m / スローレシオ1.35 → 幅2.222m。超短焦点(0.25)なら 2.222 × 0.25 = 0.56m
    fireEvent.click(screen.getByRole('button', { name: '超短焦点（レーザーTV）' }));
    expect(screen.getByLabelText('投写距離（レンズ〜スクリーン）')).toHaveValue(0.56);
  });

  it('サイズ→距離モードでは機種を変えても入力サイズを保つ', () => {
    render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: 'サイズ → 距離' }));
    setNumber('ほしい画面サイズ（対角）', '120');
    fireEvent.click(screen.getByRole('button', { name: '短焦点' }));
    expect(screen.getByLabelText('ほしい画面サイズ（対角）')).toHaveValue(120);
  });

  it('交換レンズ機ではレンズを選択できる', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: '設置用（交換レンズ）' }));
    const select = screen.getByLabelText('レンズ');
    fireEvent.change(select, { target: { value: 'tele-zoom' } });
    expect(container.textContent).toContain('3.00〜5.20');
  });

  it('シフト範囲を超えると台形補正の警告を出す', () => {
    const { container } = render(<ProjectorSimulator />);
    setNumber('画面の下端をどの高さにしたいか', '2.5');
    expect(container.textContent).toContain('台形補正');
  });

  it('シフト範囲内なら台形補正なしと表示する', () => {
    const { container } = render(<ProjectorSimulator />);
    expect(container.textContent).toContain('台形補正なしで設置できます');
  });

  it('カスタム機種ではスローレシオを直接入力できる', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: 'カスタム（実機の仕様を入力）' }));
    setNumber('スローレシオ 広角端', '0.8');
    setNumber('スローレシオ 望遠端', '0.8');
    // 幅 = 3 / 0.8 = 3.75m
    expect(container.textContent).toContain('375.0');
  });

  it('明るさを変えると評価が変わる', () => {
    const { container } = render(<ProjectorSimulator />);
    setNumber('プロジェクターの明るさ', '300');
    expect(container.textContent).toContain('暗い');
    setNumber('プロジェクターの明るさ', '20000');
    expect(container.textContent).toContain('明るすぎ');
  });

  it('部屋の奥行きが足りないとエラーを表示する', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: /部屋のサイズを入力/ }));
    setNumber('部屋の奥行き', '2');
    expect(container.textContent).toContain('奥行き');
  });

  it('天吊りを選ぶと吊り下げ量のヒントを表示する', () => {
    const { container } = render(<ProjectorSimulator />);
    fireEvent.click(screen.getByRole('button', { name: '天吊り' }));
    expect(container.textContent).toContain('吊り下げる計算です');
  });

  it('入力内容を localStorage に保存し、再マウント時に復元する', () => {
    const { unmount } = render(<ProjectorSimulator />);
    setNumber('投写距離（レンズ〜スクリーン）', '5');
    unmount();

    const { container } = render(<ProjectorSimulator />);
    expect(screen.getByLabelText('投写距離（レンズ〜スクリーン）')).toHaveValue(5);
    // 幅 = 5 / 1.35 = 3.704m
    expect(container.textContent).toContain('370.4');
  });

  it('壊れた保存データがあっても初期値で起動する', () => {
    window.localStorage.setItem('projector-sim-v1', '{壊れたJSON');
    const { container } = render(<ProjectorSimulator />);
    expect(container.textContent).toContain('100.4');
  });

  it('リセットで初期条件に戻る', () => {
    render(<ProjectorSimulator />);
    setNumber('投写距離（レンズ〜スクリーン）', '6');
    expect(screen.getByLabelText('投写距離（レンズ〜スクリーン）')).toHaveValue(6);
    fireEvent.click(screen.getByRole('button', { name: /リセット/ }));
    expect(screen.getByLabelText('投写距離（レンズ〜スクリーン）')).toHaveValue(3);
  });

  it('距離別の早見表を表示する', () => {
    render(<ProjectorSimulator />);
    const rows = screen.getAllByRole('row');
    // ヘッダー1行 + 距離8行
    expect(rows).toHaveLength(9);
  });

  it('側面図と上面図を描画する', () => {
    render(<ProjectorSimulator />);
    expect(screen.getByRole('img', { name: '側面図' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '上面図' })).toBeInTheDocument();
  });
});
