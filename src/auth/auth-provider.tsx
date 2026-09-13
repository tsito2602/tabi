import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type User = { id: string; email: string; name: string | null; avatarUrl?: string | null };
type AuthContextValue = {
  configured: boolean;
  demoEnabled: boolean;
  isDemo: boolean;
  startDemo: () => void;
  exitDemo: () => void;
  loading: boolean;
  signingIn: boolean;
  user: User | null;
  error: string | null;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  requestRaw: (path: string, init?: RequestInit) => Promise<Response>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
};

const SESSION_KEY = 'tabi.session';
const USER_KEY = 'tabi.offline-user';
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const DEMO_ENABLED = __DEV__ || Constants.expoConfig?.extra?.preview === true || process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true';
const AuthContext = createContext<AuthContextValue | null>(null);

async function readToken() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(SESSION_KEY) ?? globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function writeToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(SESSION_KEY, token);
    else { globalThis.localStorage?.removeItem(SESSION_KEY); globalThis.localStorage?.removeItem(USER_KEY); }
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await apiResponse(path, init, token);
  if (response.status === 204) return undefined as T;
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? '通信に失敗しました'), { status: response.status });
  return result;
}

async function apiResponse(path: string, init: RequestInit = {}, token?: string | null) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const isExpoGo = Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const clientId = Platform.OS === 'ios' ? iosClientId : Platform.OS === 'android' ? androidClientId : webClientId;
  const configured = Boolean(API_URL && clientId && !isExpoGo && !Constants.expoConfig?.extra?.preview);
  const [isDemo, setIsDemo] = useState(false);
  const [demoName, setDemoName] = useState('あなた');
  const startDemo = useCallback(() => { if (!DEMO_ENABLED) return; if (Platform.OS === 'web') localStorage.setItem('tabi.demo-active', '1'); setIsDemo(true); }, []);
  const exitDemo = useCallback(() => { if (Platform.OS === 'web') localStorage.removeItem('tabi.demo-active'); setIsDemo(false); }, []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: iosClientId ?? 'not-configured',
      androidClientId: androidClientId ?? 'not-configured',
      webClientId: webClientId ?? 'not-configured',
      scopes: ['openid', 'profile', 'email'],
      selectAccount: true,
    },
    { scheme: 'tabi', path: 'oauth' },
  );

  useEffect(() => {
    let active = true;
    void readToken()
      .then(async (token) => {
        if (Platform.OS === 'web') {
          if (!DEMO_ENABLED) localStorage.removeItem('tabi.demo-active');
          else if (active && localStorage.getItem('tabi.demo-active') === '1') setIsDemo(true);
        }
        if (!token) return;
        // Offline identity only unlocks this account's local cache. The API still
        // verifies the bearer session for every server read and write.
        if (Platform.OS === 'web') {
          try { const cached = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); if (active && cached?.user && cached.expiresAt > Date.now()) setUser(cached.user); } catch { /* online validation below */ }
        }
        const result = await api<{ user: User }>('/v1/me', {}, token);
        await writeToken(token);
        if (Platform.OS === 'web') {
          localStorage.setItem(USER_KEY, JSON.stringify({ user: result.user, expiresAt: Date.now() + 30 * 86400000 }));
          if (!localStorage.getItem('tabi.legacy-cache-owner')) localStorage.setItem('tabi.legacy-cache-owner', result.user.id);
        }
        if (active) setUser(result.user);
      })
      .catch(async (cause) => {
        if (cause?.status === 401 || cause?.status === 403) { await writeToken(null); if (active) setUser(null); }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!response) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (response.type !== 'success') {
        if (response.type === 'error') setError('Googleログインを完了できませんでした');
        setSigningIn(false);
        return;
      }
      const idToken = response.params.id_token ?? response.authentication?.idToken;
      if (!idToken) {
        setError('GoogleからIDトークンを受け取れませんでした');
        setSigningIn(false);
        return;
      }
      void api<{ token: string; user: User }>('/v1/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      })
        .then(async (result) => {
          await writeToken(result.token);
          if (Platform.OS === 'web') localStorage.setItem(USER_KEY, JSON.stringify({ user: result.user, expiresAt: Date.now() + 30 * 86400000 }));
          if (!active) return;
          setUser(result.user);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : 'ログインに失敗しました');
        })
        .finally(() => {
          if (active) setSigningIn(false);
        });
    });
    return () => {
      active = false;
    };
  }, [response]);

  const signIn = useCallback(async () => {
    if (!configured || !request) {
      setError('Google OAuthの設定がまだ完了していません');
      return;
    }
    setSigningIn(true);
    setError(null);
    try { await promptAsync(); } catch (cause) { setSigningIn(false); setError(cause instanceof Error ? cause.message : 'ログインを開始できませんでした'); }
  }, [configured, promptAsync, request]);

  const signOut = useCallback(async () => {
    const token = await readToken();
    if (token) await api('/v1/auth/logout', { method: 'POST' }, token).catch(() => undefined);
    await writeToken(null);
    setUser(null);
  }, []);

  const requestApi = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    if (isDemo) throw new Error('サンプルでは共有機能を利用できません');
    const token = await readToken();
    if (!token) throw new Error('ログインが必要です');
    return api<T>(path, init, token);
  }, [isDemo]);

  const requestRaw = useCallback(async (path: string, init: RequestInit = {}) => {
    if (isDemo) throw new Error('サンプルでは共有機能を利用できません');
    const token = await readToken();
    if (!token) throw new Error('ログインが必要です');
    const response = await apiResponse(path, init, token);
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? '通信に失敗しました');
    }
    return response;
  }, [isDemo]);

  const updateProfile = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('表示名は1〜100文字で入力してください');
    if (isDemo) { setDemoName(trimmed); return; }
    const result = await requestApi<{ user: User }>('/v1/me', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
    setUser(result.user);
    if (Platform.OS === 'web') {
      try { localStorage.setItem(USER_KEY, JSON.stringify({ user: result.user, expiresAt: Date.now() + 30 * 86400000 })); } catch { /* Server save succeeded. */ }
    }
  }, [isDemo, requestApi]);

  const value = useMemo(
    () => ({ configured, demoEnabled: DEMO_ENABLED, isDemo, startDemo, exitDemo, loading, signingIn, user: isDemo ? { id: 'demo-self', email: '', name: demoName } : user, error, request: requestApi, requestRaw, signIn, signOut, updateProfile }),
    [configured, isDemo, demoName, startDemo, exitDemo, error, loading, requestApi, requestRaw, signIn, signOut, signingIn, user, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
