import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/contexts/AuthContext';

// Store the callback so we can trigger it manually
let authStateCallback = null;

vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    authStateCallback = callback;
    return vi.fn(); // unsubscribe
  }),
  signInWithPopup: vi.fn().mockResolvedValue({ user: { uid: 'google-user', displayName: 'Google User' } }),
  signOut: vi.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: vi.fn(),
}));

// Helper component to consume context
function TestConsumer() {
  const { user, loading, googleSignIn, logOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.displayName : 'null'}</span>
      <button data-testid="sign-in" onClick={googleSignIn}>Sign In</button>
      <button data-testid="sign-out" onClick={logOut}>Sign Out</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  it('provides user as null initially with loading true', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('user').textContent).toBe('null');
    // Loading is true until onAuthStateChanged fires
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('updates when onAuthStateChanged fires with a user', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Simulate Firebase auth state change
    act(() => {
      authStateCallback({ uid: 'test-uid', displayName: 'Test User' });
    });

    expect(screen.getByTestId('user').textContent).toBe('Test User');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('updates when onAuthStateChanged fires with null (signed out)', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authStateCallback(null);
    });

    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('googleSignIn calls signInWithPopup', async () => {
    const { signInWithPopup } = await import('firebase/auth');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByTestId('sign-in').click();
    });

    expect(signInWithPopup).toHaveBeenCalled();
  });

  it('logOut calls signOut', async () => {
    const { signOut } = await import('firebase/auth');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByTestId('sign-out').click();
    });

    expect(signOut).toHaveBeenCalled();
  });
});
