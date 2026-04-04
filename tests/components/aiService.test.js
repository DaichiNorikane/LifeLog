import { analyzeImage } from '@/services/aiService';

vi.mock('@/app/actions/image-analysis', () => ({
  analyzeImageWithGemini: vi.fn(),
}));

vi.mock('@/utils/mockData', () => ({
  getMockResult: vi.fn(() => ({
    foodName: 'Mock Food',
    calories: 300,
    macros: { protein: 10, fat: 5, carbs: 40 },
  })),
}));

// Mock FileReader
class MockFileReader {
  readAsDataURL() {
    setTimeout(() => {
      this.onload({ target: { result: 'data:image/jpeg;base64,mockbase64' } });
    }, 0);
  }
}
global.FileReader = MockFileReader;

// Mock Image
class MockImage {
  set src(val) {
    this.width = 800;
    this.height = 600;
    setTimeout(() => this.onload(), 0);
  }
}
global.Image = MockImage;

// Mock canvas
const mockToDataURL = vi.fn(() => 'data:image/jpeg;base64,resizedbase64');
const mockGetContext = vi.fn(() => ({
  drawImage: vi.fn(),
}));
document.createElement = vi.fn((tag) => {
  if (tag === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext: mockGetContext,
      toDataURL: mockToDataURL,
    };
  }
  return document.__proto__.createElement.call(document, tag);
});

describe('aiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzeImage calls analyzeImageWithGemini and returns result with isMock: false', async () => {
    const { analyzeImageWithGemini } = await import('@/app/actions/image-analysis');
    analyzeImageWithGemini.mockResolvedValue({
      foodName: 'カレーライス',
      calories: 700,
      macros: { protein: 20, fat: 15, carbs: 80 },
    });

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await analyzeImage(file);

    expect(analyzeImageWithGemini).toHaveBeenCalled();
    expect(result.foodName).toBe('カレーライス');
    expect(result.isMock).toBe(false);
    expect(result.confidence).toBe(0.99);
  });

  it('falls back to mock on API error response', async () => {
    const { analyzeImageWithGemini } = await import('@/app/actions/image-analysis');
    analyzeImageWithGemini.mockResolvedValue({ error: 'API key invalid' });

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await analyzeImage(file);

    expect(result.isMock).toBe(true);
    expect(result.foodName).toBe('Mock Food');
  });

  it('falls back to mock on network error', async () => {
    const { analyzeImageWithGemini } = await import('@/app/actions/image-analysis');
    analyzeImageWithGemini.mockRejectedValue(new Error('Network error'));

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await analyzeImage(file);

    expect(result.isMock).toBe(true);
    expect(result.error).toBe('API Error (Network/Size)');
  });

  it('identifies 429 as Quota Exceeded', async () => {
    const { analyzeImageWithGemini } = await import('@/app/actions/image-analysis');
    analyzeImageWithGemini.mockRejectedValue(new Error('429 Too Many Requests'));

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await analyzeImage(file);

    expect(result.isMock).toBe(true);
    expect(result.error).toBe('Quota Exceeded');
  });
});
