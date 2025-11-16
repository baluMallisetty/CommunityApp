// src/config.js
const env = typeof process !== 'undefined' && process.env ? process.env : {};

const DEFAULT_API_BASE = 'http://localhost:3001'; // Android emulator: 'http://10.0.2.2:3001'
const DEFAULT_TENANT = 't123';
const GOOGLE_CLIENT_ID_PLACEHOLDER = 'your_google_client_id.apps.googleusercontent.com';
const FACEBOOK_APP_ID_PLACEHOLDER = '123456789012345';

export const BASE_URL = env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
export const DEFAULT_TENANT_ID = env.EXPO_PUBLIC_TENANT_ID || DEFAULT_TENANT;

// --- OAuth client IDs (replace these) ---
export const GOOGLE_CLIENT_ID = env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_PLACEHOLDER;
export const FACEBOOK_APP_ID = env.EXPO_PUBLIC_FACEBOOK_APP_ID || FACEBOOK_APP_ID_PLACEHOLDER;
export const APPLE_CLIENT_ID = env.EXPO_PUBLIC_APPLE_CLIENT_ID || 'com.your.bundle.id'; // Service ID or App ID

export const GOOGLE_CLIENT_CONFIGURED = Boolean(env.EXPO_PUBLIC_GOOGLE_CLIENT_ID);
export const FACEBOOK_APP_CONFIGURED = Boolean(env.EXPO_PUBLIC_FACEBOOK_APP_ID);
