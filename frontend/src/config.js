// src/config.js
const env = typeof process !== 'undefined' && process.env ? process.env : {};

const DEFAULT_API_BASE = 'https://6e2bba54699c.ngrok-free.app' || 'http://localhost:3001'; // Android emulator: 'http://10.0.2.2:3001'
const DEFAULT_TENANT = 't123';
const GOOGLE_CLIENT_ID_PLACEHOLDER = 'your_google_client_id.apps.googleusercontent.com';
const FACEBOOK_APP_ID_PLACEHOLDER = '123456789012345';

const hasRealValue = (value, placeholder) =>
  typeof value === 'string' && value.trim().length > 0 && (placeholder ? value !== placeholder : true);

export const BASE_URL = env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
export const DEFAULT_TENANT_ID = env.EXPO_PUBLIC_TENANT_ID || DEFAULT_TENANT;

// --- OAuth client IDs (replace these) ---
const GOOGLE_CLIENT_ID_RAW = env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const FACEBOOK_APP_ID_RAW = env.EXPO_PUBLIC_FACEBOOK_APP_ID || '';

export const GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID_RAW || GOOGLE_CLIENT_ID_PLACEHOLDER;
export const FACEBOOK_APP_ID = FACEBOOK_APP_ID_RAW || FACEBOOK_APP_ID_PLACEHOLDER;
export const APPLE_CLIENT_ID = env.EXPO_PUBLIC_APPLE_CLIENT_ID || 'com.your.bundle.id'; // Service ID or App ID

export const GOOGLE_CLIENT_CONFIGURED = hasRealValue(GOOGLE_CLIENT_ID_RAW, GOOGLE_CLIENT_ID_PLACEHOLDER);
export const FACEBOOK_APP_CONFIGURED = hasRealValue(FACEBOOK_APP_ID_RAW, FACEBOOK_APP_ID_PLACEHOLDER);
