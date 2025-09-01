// src/api/client.js
import { BASE_URL } from '../config';
import { getTokens, saveTokens, clearTokens, isAccessTokenExpired } from './tokenStore';

let refreshing = null;

async function refreshAccessToken() {
  // prevent concurrent refresh calls
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const tokens = await getTokens();
    if (!tokens?.refreshToken) throw new Error('No refresh token');
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken })
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json(); // expect { accessToken, expiresAt }
    const updated = {
      accessToken: data.accessToken || data.token,
      refreshToken: tokens.refreshToken,
      expiresAt: data.expiresAt || null
    };
    await saveTokens(updated);
    return updated;
  })();

  try { return await refreshing; }
  finally { refreshing = null; }
}

export async function request(path, { method = 'GET', headers = {}, body, raw = false } = {}) {
  const doFetch = async () => {
    const tokens = await getTokens();
    let authHeader = {};
    if (tokens?.accessToken) {
      authHeader = { Authorization: `Bearer ${tokens.accessToken}` };
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': body instanceof FormData ? undefined : 'application/json', ...authHeader, ...headers },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    if (raw) return res;
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(text || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };

  try {
    // proactive refresh if we have exp and it's close
    const tokens = await getTokens();
    if (tokens?.accessToken && isAccessTokenExpired(tokens.expiresAt)) {
      await refreshAccessToken();
    }
    return await doFetch();
  } catch (err) {
    // on 401, try a refresh once and retry the original request
    if (err.status === 401) {
      try {
        await refreshAccessToken();
        return await doFetch();
      } catch {
        await clearTokens();
        throw new Error('Session expired. Please log in again.');
      }
    }
    throw err;
  }
}
