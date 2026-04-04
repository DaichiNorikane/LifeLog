/**
 * Shared mock factory for @google/generative-ai
 */

export function createMockGenAI(responseText = '{}') {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      text: () => responseText,
    },
  });

  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });

  class MockGoogleGenerativeAI {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }
    getGenerativeModel(config) {
      return mockGetGenerativeModel(config);
    }
  }

  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    mockGetGenerativeModel,
    mockGenerateContent,
  };
}

export function setupGeminiMock(vi, responseText = '{}') {
  const mock = createMockGenAI(responseText);

  vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: mock.GoogleGenerativeAI,
  }));

  return mock;
}
