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

export async function setTokens(tokens) {
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

// Also export a default object so either import style works:
//   import { getTokens } from './tokenStore'
//   import tokenStore from './tokenStore'; tokenStore.getTokens()
export default { getTokens, setTokens, clearTokens };
