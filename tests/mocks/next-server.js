/**
 * Mock for next/server
 */

export function setupNextServerMock(vi) {
  vi.mock('next/server', () => ({
    NextResponse: {
      json: vi.fn((body, init = {}) => {
        const status = init.status || 200;
        return {
          status,
          json: async () => body,
          headers: new Map(),
        };
      }),
    },
    NextRequest: vi.fn().mockImplementation((url, init = {}) => ({
      url,
      method: init.method || 'GET',
      headers: new Map(Object.entries(init.headers || {})),
      json: async () => init.body ? JSON.parse(init.body) : {},
    })),
  }));
}
