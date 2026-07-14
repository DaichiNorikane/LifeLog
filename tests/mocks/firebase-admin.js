/**
 * Mock for firebase-admin (Firestore admin SDK)
 */

export function createChainableMock() {
  const mockData = { exists: false, data: () => null };

  const mockGet = vi.fn().mockResolvedValue(mockData);
  const mockSet = vi.fn().mockResolvedValue(undefined);
  const mockUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);

  const mockDoc = vi.fn().mockReturnValue({
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    delete: mockDelete,
  });

  const mockWhere = vi.fn().mockReturnValue({
    get: mockGet,
    where: vi.fn().mockReturnValue({ get: mockGet }),
    orderBy: vi.fn().mockReturnValue({ get: mockGet, limit: vi.fn().mockReturnValue({ get: mockGet }) }),
    limit: vi.fn().mockReturnValue({ get: mockGet }),
  });

  const mockOrderBy = vi.fn().mockReturnValue({
    get: mockGet,
    limit: vi.fn().mockReturnValue({ get: mockGet }),
  });

  const mockCollection = vi.fn().mockReturnValue({
    doc: mockDoc,
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockGet,
    add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  });

  const db = {
    collection: mockCollection,
  };

  return { db, mockCollection, mockDoc, mockGet, mockSet, mockUpdate, mockDelete };
}

export function setupFirebaseAdminMock(vi) {
  const chainable = createChainableMock();

  vi.doMock('@/lib/firebase/admin', () => ({
    db: chainable.db,
  }));

  vi.doMock('firebase-admin/firestore', () => ({
    FieldValue: {
      delete: vi.fn().mockReturnValue('__DELETE__'),
      serverTimestamp: vi.fn().mockReturnValue('__SERVER_TIMESTAMP__'),
    },
  }));

  return chainable;
}
