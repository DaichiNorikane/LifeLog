import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockManager from '@/components/StockManager';

// Mock lucide-react icons
vi.mock('lucide-react', () => require('../mocks/lucide-react'));

describe('StockManager', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    stockItems: [],
    onAdd: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when not open', () => {
    const { container } = render(<StockManager {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders without crashing when open', () => {
    render(<StockManager {...defaultProps} />);
    expect(screen.getByText('食材・食事環境メモ')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<StockManager {...defaultProps} stockItems={[]} />);
    expect(screen.getByText(/リストは空です/)).toBeInTheDocument();
  });

  it('displays stock items when provided', () => {
    const items = [
      { id: '1', name: 'キャベツ' },
      { id: '2', name: '鶏むね肉' },
    ];
    render(<StockManager {...defaultProps} stockItems={items} />);
    expect(screen.getByText('キャベツ')).toBeInTheDocument();
    expect(screen.getByText('鶏むね肉')).toBeInTheDocument();
  });

  it('calls onDelete when delete button clicked', () => {
    const items = [{ id: '1', name: 'キャベツ' }];
    render(<StockManager {...defaultProps} stockItems={items} />);
    // The delete button contains the Trash2 icon
    const deleteBtn = screen.getByTestId('icon-Trash2').closest('button');
    fireEvent.click(deleteBtn);
    expect(defaultProps.onDelete).toHaveBeenCalledWith('1');
  });

  it('calls onClose when close button clicked', () => {
    render(<StockManager {...defaultProps} />);
    const closeBtn = screen.getByTestId('icon-X').closest('button');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onAdd when form is submitted with valid input', async () => {
    render(<StockManager {...defaultProps} />);
    const input = screen.getByPlaceholderText(/キャベツ/);
    fireEvent.change(input, { target: { value: 'トマト' } });
    fireEvent.submit(input.closest('form'));
    await waitFor(() => {
      expect(defaultProps.onAdd).toHaveBeenCalledWith({ name: 'トマト', type: 'general' });
    });
  });

  it('does not call onAdd when input is empty', () => {
    render(<StockManager {...defaultProps} />);
    const submitBtn = screen.getByTestId('icon-Plus').closest('button');
    expect(submitBtn).toBeDisabled();
  });
});
