// src/api/auth.js
import { request } from './client';
import { saveTokens, clearTokens, getTokens } from './tokenStore';

// --- Custom auth ---
export async function signup({ tenantId, email, username, password, name }) {
  const data = await request('/auth/signup', { method: 'POST', body: { tenantId, email, username, password, name } });
  await persistTokensFromAuthResponse(data);
  return data;
}

export async function login({ tenantId, emailOrUsername, password }) {
  const data = await request('/auth/login', { method: 'POST', body: { tenantId, emailOrUsername, password } });
  await persistTokensFromAuthResponse(data);
  return data;
}

// --- Social auth (exchange provider tokens at your backend) ---
export async function loginWithGoogle({ idToken, accessToken }) {
  const data = await request('/auth/oauth/google', { method: 'POST', body: { idToken, accessToken } });
  await persistTokensFromAuthResponse(data);
  return data;
}

export async function loginWithFacebook({ accessToken }) {
  const data = await request('/auth/oauth/facebook', { method: 'POST', body: { accessToken } });
  await persistTokensFromAuthResponse(data);
  return data;
}

export async function loginWithApple({ idToken }) {
  const data = await request('/auth/oauth/apple', { method: 'POST', body: { idToken } });
  await persistTokensFromAuthResponse(data);
  return data;
}

// --- Me / logout ---
export const getMe = () => request('/me');
export async function logout() { await clearTokens(); }

// --- Helper: normalize and store tokens from backend ---
async function persistTokensFromAuthResponse(resp) {
  // support both old {token} and new {accessToken, refreshToken, expiresAt}
  const accessToken = resp.accessToken || resp.token;
  const refreshToken = resp.refreshToken || resp.refresh_token || null;
  const expiresAt   = resp.expiresAt || null; // ISO string if backend sends
  if (!accessToken) throw new Error('No access token in response');

  await saveTokens({ accessToken, refreshToken, expiresAt });
  return getTokens();
}
