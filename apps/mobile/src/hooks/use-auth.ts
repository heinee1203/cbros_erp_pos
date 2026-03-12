import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  login as loginService,
  logout as logoutService,
  getStoredUser,
  getStoredToken,
  isTokenExpired,
  setActiveLocation as setLocationService,
  getActiveLocation,
  fetchLocations,
  type UserInfo,
  type LocationInfo,
} from '@/services/auth';

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  locationId: string | null;
  locations: LocationInfo[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setLocationId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap from stored credentials
  useEffect(() => {
    const stored = getStoredToken();
    if (__DEV__) {
      console.log('[auth] Bootstrap: stored token exists:', !!stored);
      if (stored) console.log('[auth] Bootstrap: token expired:', isTokenExpired(stored));
    }
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
      setUser(getStoredUser());
      setLocationId(getActiveLocation());
      fetchLocations()
        .then(setLocations)
        .catch((err) => {
          if (__DEV__) console.error('[auth] Bootstrap fetchLocations failed:', err.message);
          // If token is rejected, clear auth so user can re-login
          if (err.status === 401) {
            logoutService();
            setToken(null);
            setUser(null);
            setLocationId(null);
          }
        });
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginService(email, password);
    setToken(result.token);
    setUser(result.user);

    // Verify token was persisted correctly (catches MMKV encryption issues)
    const storedCheck = getStoredToken();
    if (__DEV__) {
      console.log('[auth] Token stored OK:', !!storedCheck, 'matches:', storedCheck === result.token);
    }
    if (!storedCheck || storedCheck !== result.token) {
      console.error('[auth] Token storage verification failed — MMKV may not be working');
      throw new Error('Token storage failed. Please restart the app and try again.');
    }

    let locs: LocationInfo[];
    try {
      locs = await fetchLocations();
    } catch (err: any) {
      // Login succeeded but fetching locations failed — give a clear error
      if (__DEV__) console.error('[auth] fetchLocations after login failed:', err.message);
      if (err.status === 401) {
        throw new Error(
          'Login OK but server rejected token on next request. ' +
          'Check that the API server was not restarted between calls.',
        );
      }
      throw err;
    }
    setLocations(locs);
    // Auto-select first retail location or first available
    const retail = locs.find(l => l.type === 'RETAIL_STORE' || l.type === 'STORE');
    const defaultLoc = retail ?? locs[0];
    if (defaultLoc) {
      setLocationService(defaultLoc.id);
      setLocationId(defaultLoc.id);
    }
  }, []);

  const logout = useCallback(() => {
    logoutService();
    setToken(null);
    setUser(null);
    setLocationId(null);
    setLocations([]);
  }, []);

  const handleSetLocation = useCallback((id: string) => {
    setLocationService(id);
    setLocationId(id);
  }, []);

  const value: AuthContextValue = {
    token,
    user,
    locationId,
    locations,
    isAuthenticated: !!token && !!user && !!locationId,
    isLoading,
    login,
    logout,
    setLocationId: handleSetLocation,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
