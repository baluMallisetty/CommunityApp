// src/api/tokenStore.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cmh_tokens'; // { accessToken, refreshToken, expiresAt? }
let memory = null;

export async function getTokens() {
  if (memory) return memory;
  const raw = await AsyncStorage.getItem(KEY);
  memory = raw ? JSON.parse(raw) : null;
  return memory;
}

// Persist the latest auth tokens. Pass `null` to clear.
export async function saveTokens(tokens) {
  memory = tokens || null;
  if (tokens) {
    await AsyncStorage.setItem(KEY, JSON.stringify(tokens));
  } else {
    await AsyncStorage.removeItem(KEY);
  }
}

export async function clearTokens() {
  memory = null;
  await AsyncStorage.removeItem(KEY);
}

// Determine whether the current access token is expired or close to expiring.
// If `expiresAt` is falsy, assume the token does not expire.
export function isAccessTokenExpired(expiresAt) {
  if (!expiresAt) return false;
  const exp = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
  // Refresh a minute early to avoid edge cases with clock skew
  return Date.now() >= exp - 60 * 1000;
}

// Also export a default object so either import style works:
//   import { getTokens } from './tokenStore'
//   import tokenStore from './tokenStore'; tokenStore.getTokens()
export default { getTokens, saveTokens, clearTokens, isAccessTokenExpired };
