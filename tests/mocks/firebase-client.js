/**
 * Mock for firebase/firestore client SDK functions
 */

export const mockCollection = vi.fn();
export const mockAddDoc = vi.fn().mockResolvedValue({ id: 'mock-id' });
export const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });
export const mockQuery = vi.fn();
export const mockWhere = vi.fn();
export const mockOrderBy = vi.fn();
export const mockLimit = vi.fn();
export const mockDoc = vi.fn();
export const mockGetDoc = vi.fn().mockResolvedValue({
  exists: () => false,
  data: () => null,
});
export const mockSetDoc = vi.fn().mockResolvedValue(undefined);
export const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
export const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
export const mockWriteBatch = vi.fn().mockReturnValue({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});
export const mockTimestamp = {
  now: vi.fn().mockReturnValue({ seconds: 0, nanoseconds: 0 }),
  fromDate: vi.fn((date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 })),
};

export function setupFirebaseClientMock(vi) {
  vi.mock('firebase/firestore', () => ({
    collection: mockCollection,
    addDoc: mockAddDoc,
    getDocs: mockGetDocs,
    query: mockQuery,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    doc: mockDoc,
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
    deleteDoc: mockDeleteDoc,
    updateDoc: mockUpdateDoc,
    writeBatch: mockWriteBatch,
    Timestamp: mockTimestamp,
  }));

  vi.mock('@/lib/firebase/config', () => ({
    db: {},
    auth: {},
  }));
}
