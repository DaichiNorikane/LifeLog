import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LineConnector from '@/components/LineConnector';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  saveLinkCode: vi.fn(),
}));

describe('LineConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('default variant (not linked)', () => {
    it('renders without crashing', () => {
      render(<LineConnector userId="test-user" profile={null} />);
      expect(screen.getByText('LINE通知設定')).toBeInTheDocument();
    });

    it('shows link code generation button when not linked', () => {
      render(<LineConnector userId="test-user" profile={null} />);
      expect(screen.getByText('連携コードを発行')).toBeInTheDocument();
    });

    it('shows linked status when profile has lineUserId', () => {
      render(<LineConnector userId="test-user" profile={{ lineUserId: 'U123' }} />);
      expect(screen.getByText('LINE連携済み')).toBeInTheDocument();
    });

    it('generates code on button click', async () => {
      const { addDoc } = await import('firebase/firestore');
      render(<LineConnector userId="test-user" profile={null} />);
      fireEvent.click(screen.getByText('連携コードを発行'));

      await waitFor(() => {
        expect(addDoc).toHaveBeenCalled();
      });
    });
  });

  describe('header variant', () => {
    it('shows linked badge when profile has lineUserId', () => {
      render(<LineConnector userId="test-user" profile={{ lineUserId: 'U123' }} variant="header" />);
      expect(screen.getByText(/LINE済/)).toBeInTheDocument();
    });

    it('shows LINE連携 button when not linked', () => {
      render(<LineConnector userId="test-user" profile={null} variant="header" />);
      expect(screen.getByText('LINE連携')).toBeInTheDocument();
    });
  });
});
