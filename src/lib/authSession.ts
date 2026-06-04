import type { User } from '../app/models/types';

const SESSION_KEY = 'alnawras_auth_session';

export interface AuthSession {
  accessToken: string;
  expiresAt: number;
  user: User;
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.user || parsed.expiresAt <= Date.now()) {
      clearAuthSession();
      return null;
    }
    parsed.user.createdAt = new Date(parsed.user.createdAt);
    if (parsed.user.lastLogin) parsed.user.lastLogin = new Date(parsed.user.lastLogin);
    return parsed;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession(session: AuthSession | null) {
  if (!session) {
    clearAuthSession();
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getAccessToken(): string | null {
  return loadAuthSession()?.accessToken ?? null;
}
