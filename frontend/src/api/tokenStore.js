// src/api/tokenStore.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cmh_tokens'; // { accessToken, refreshToken, expiresAtISO }

export async function saveTokens(t) {
  await AsyncStorage.setItem(KEY, JSON.stringify(t));
}

export async function getTokens() {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearTokens() {
  await AsyncStorage.removeItem(KEY);
}

export function isAccessTokenExpired(expiresAtISO) {
  if (!expiresAtISO) return false; // if backend didn't send exp, assume valid
  const skewMs = 30 * 1000; // 30s safety
  return Date.now() + skewMs > new Date(expiresAtISO).getTime();
}
