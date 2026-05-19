import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  login as loginService,
  logout as logoutService,
  getStoredUser,
  getStoredToken,
  isTokenExpired,
  setActiveLocation as setLocationService,
  clearActiveLocation,
  getActiveLocation,
  getStoredLocations,
  fetchLocations,
  type UserInfo,
  type LocationInfo,
} from '@/services/auth';
import {
  bindDeviceToLocation,
  getDeviceBinding,
  type DeviceBinding,
} from '@/config/device-binding';
import { useCartStore } from '@/stores/cart-store';

type BindingInvalidReason = 'missing' | 'inactive' | null;

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  locationId: string | null;
  locations: LocationInfo[];
  deviceBinding: DeviceBinding | null;
  bindingInvalidReason: BindingInvalidReason;
  isDeviceBindingInvalid: boolean;
  isAuthenticated: boolean;
  needsLocationSelect: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setLocationId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getInitialAuthState() {
  try {
    const stored = getStoredToken();
    const expired = stored ? isTokenExpired(stored) : true;

    if (!stored || expired) {
      if (stored) logoutService();
      return { token: null, user: null, locationId: null, locations: [], deviceBinding: null };
    }

    const storedUser = getStoredUser();
    if (!storedUser) {
      console.error('[auth] Stored token exists without stored user; clearing auth');
      logoutService();
      return { token: null, user: null, locationId: null, locations: [], deviceBinding: null };
    }

    return {
      token: stored,
      user: storedUser,
      locationId: getActiveLocation(),
      locations: getStoredLocations(),
      deviceBinding: getDeviceBinding(),
    };
  } catch (err) {
    console.error('[auth] Initial auth restore failed:', err);
    logoutService();
    return { token: null, user: null, locationId: null, locations: [], deviceBinding: null };
  }
}

function getBindingInvalidReason(
  binding: DeviceBinding | null,
  locations: LocationInfo[],
): BindingInvalidReason {
  if (!binding || locations.length === 0) return null;
  const boundLocation = locations.find(location => location.id === binding.locationId);
  if (!boundLocation) return 'missing';
  return boundLocation.isActive ? null : 'inactive';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialAuth] = useState(getInitialAuthState);
  const [token, setToken] = useState<string | null>(initialAuth.token);
  const [user, setUser] = useState<UserInfo | null>(initialAuth.user);
  const [locationId, setLocationId] = useState<string | null>(initialAuth.locationId);
  const [locations, setLocations] = useState<LocationInfo[]>(initialAuth.locations);
  const [deviceBinding, setDeviceBindingState] = useState<DeviceBinding | null>(initialAuth.deviceBinding);
  const [isLoading] = useState(false);
  const bindingInvalidReason = getBindingInvalidReason(deviceBinding, locations);

  // Bootstrap from stored credentials
  useEffect(() => {
    let isMounted = true;

    if (initialAuth.token && initialAuth.user) {
      fetchLocations()
        .then((locs) => {
          if (!isMounted) return;
          setLocations(locs);

          const activeIds = new Set(locs.filter(loc => loc.isActive).map(loc => loc.id));
          const binding = getDeviceBinding();
          setDeviceBindingState(binding);

          if (binding) {
            setLocationService(binding.locationId);
            setLocationId(binding.locationId);
            useCartStore.getState().reloadForCurrentLocation();
            return;
          }

          if (locationId && !activeIds.has(locationId)) {
            clearActiveLocation();
            setLocationId(null);
            useCartStore.getState().reloadForCurrentLocation();
          }
        })
        .catch((err) => {
          console.error('[auth] Bootstrap fetchLocations failed:', err.message);
          // If token is rejected, clear auth so user can re-login
          if (err.status === 401 && isMounted) {
            logoutService();
            setToken(null);
            setUser(null);
            setLocationId(null);
            setLocations([]);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [initialAuth.token, initialAuth.user, locationId]);

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

    const binding = getDeviceBinding();
    setDeviceBindingState(binding);

    if (binding) {
      setLocationService(binding.locationId);
      setLocationId(binding.locationId);
      useCartStore.getState().reloadForCurrentLocation();
      return;
    }

    clearActiveLocation();
    setLocationId(null);
    useCartStore.getState().reloadForCurrentLocation();
  }, []);

  const logout = useCallback(() => {
    logoutService();
    setToken(null);
    setUser(null);
    setLocationId(null);
    setLocations([]);
    setDeviceBindingState(getDeviceBinding());
    useCartStore.getState().reloadForCurrentLocation();
  }, []);

  const handleSetLocation = useCallback((id: string) => {
    const existingBinding = deviceBinding ?? getDeviceBinding();
    if (existingBinding) {
      setLocationService(existingBinding.locationId);
      setLocationId(existingBinding.locationId);
      useCartStore.getState().reloadForCurrentLocation();
      return;
    }

    const availableLocations = locations.length > 0 ? locations : getStoredLocations();
    const selectedLocation = availableLocations.find(location => location.id === id && location.isActive);
    if (!selectedLocation) {
      console.error('[auth] Cannot bind device to missing or inactive location:', id);
      return;
    }

    const binding = bindDeviceToLocation(
      selectedLocation,
      user?.fullName ?? user?.email ?? 'Unknown user',
    );

    setDeviceBindingState(binding);
    setLocationService(binding.locationId);
    setLocationId(binding.locationId);
    useCartStore.getState().reloadForCurrentLocation();
  }, [deviceBinding, locations, user?.email, user?.fullName]);

  const value: AuthContextValue = {
    token,
    user,
    locationId,
    locations,
    deviceBinding,
    bindingInvalidReason,
    isDeviceBindingInvalid: bindingInvalidReason !== null,
    isAuthenticated: !!token && !!user,
    needsLocationSelect: !!token && !!user && !deviceBinding,
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
