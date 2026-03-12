"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface LocationInfo {
  id: string;
  name: string;
  code: string;
  type: string;
  address: string | null;
  isActive: boolean;
}

interface AuthState {
  token: string;
  locationId: string;
  user: UserInfo;
  primaryLocationId: string;
}

interface AuthContextValue {
  /** JWT token for API calls */
  token: string;
  /** Currently selected location ID */
  locationId: string;
  /** User profile */
  user: UserInfo | null;
  /** All accessible locations */
  locations: LocationInfo[];
  /** True while initial auth is loading */
  loading: boolean;
  /** Whether auth succeeded */
  isAuthenticated: boolean;
  /** Switch the active location globally */
  setLocationId: (id: string) => void;
  /** Login with email/password */
  login: (email: string, password: string) => Promise<void>;
  /** Clear session and logout */
  logout: () => void;
}

/* ─────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const AUTH_STORAGE_KEY = "apex-dev-auth";
const LOCATION_STORAGE_KEY = "apex-active-location";

/* ─────────────────────────────────────────────
 * Safe JWT decode (handles non-ASCII / base64url)
 * ───────────────────────────────────────────── */

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

/* ─────────────────────────────────────────────
 * Context
 * ───────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // ── Fetch locations for an authenticated user ──
  const fetchLocations = useCallback(async (authData: AuthState) => {
    try {
      const locRes = await fetch(`${API_BASE}/locations`, {
        headers: { Authorization: `Bearer ${authData.token}` },
      });
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData.data ?? []);
      }
    } catch {
      // Location fetch failed — non-fatal
    }
  }, []);

  // ── Bootstrap: restore session from sessionStorage ──
  useEffect(() => {
    (async () => {
      try {
        const cached = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as AuthState;
            if (parsed.token && parsed.locationId) {
              setAuth(parsed);
              await fetchLocations(parsed);

              // Restore persisted active location or use primary
              const savedLoc = localStorage.getItem(LOCATION_STORAGE_KEY);
              setActiveLocationId(savedLoc || parsed.locationId);
            }
          } catch {
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
      } catch {
        // sessionStorage unavailable — degrade gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchLocations]);

  // ── Login ──
  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Login failed (${res.status})`
        );
      }
      const data = await res.json();
      const payload = decodeJwtPayload(data.token);
      const authData: AuthState = {
        token: data.token,
        locationId: String(payload.primaryLocationId ?? ""),
        user: data.user,
        primaryLocationId: String(payload.primaryLocationId ?? ""),
      };

      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      setAuth(authData);
      setActiveLocationId(authData.locationId);
      await fetchLocations(authData);
    },
    [fetchLocations]
  );

  // ── Logout ──
  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(LOCATION_STORAGE_KEY);
    } catch {
      // storage unavailable
    }
    setAuth(null);
    setLocations([]);
    setActiveLocationId("");
  }, []);

  // ── Switch location ──
  const setLocationId = useCallback((id: string) => {
    setActiveLocationId(id);
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, id);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Resolve active locationId: prefer explicit selection, fallback to primary
  const resolvedLocationId = activeLocationId || auth?.locationId || "";

  return (
    <AuthContext.Provider
      value={{
        token: auth?.token ?? "",
        locationId: resolvedLocationId,
        user: auth?.user ?? null,
        locations,
        loading,
        isAuthenticated: !!auth,
        setLocationId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ─────────────────────────────────────────────
 * Hook
 * ───────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
