// src/api/apiClient.js
import { BASE_URL } from '../config';
import { getTokens } from './tokenStore';

function safeJson(t) { try { return t ? JSON.parse(t) : null; } catch { return t; } }

async function core(path, { method = 'GET', headers = {}, body } = {}) {
  const url = `${BASE_URL}${path}`;

  // Auth header (compatible with our tokenStore)
  const tokens = await getTokens();
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

  // JSON request bodies (unless FormData)
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  const data = safeJson(text);

  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

export const apiGet    = (path)       => core(path, { method: 'GET' });
export const apiPost   = (path, body) => core(path, { method: 'POST',  body });
export const apiPatch  = (path, body) => core(path, { method: 'PATCH', body });
export const apiDelete = (path, body) => core(path, { method: 'DELETE', body });

export async function apiUploadPost(path, { title, content, lat, lng, files = [] }) {
  const form = new FormData();
  if (title)   form.append('title', title);
  if (content) form.append('content', content);
  if (lat != null) form.append('lat', String(lat));
  if (lng != null) form.append('lng', String(lng));

  (files || []).forEach((f, i) => {
    if (typeof File !== 'undefined' && f instanceof File) {
      form.append('attachments', f); // web File
    } else {
      form.append('attachments', {
        uri: f.uri,
        name: f.name || `file_${i}`,
        type: f.type || 'application/octet-stream',
      });
    }
  });

  // Let fetch set boundary; just add auth
  const tokens = await getTokens();
  const headers = tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {};

  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: form });
  const text = await res.text();
  const data = safeJson(text);
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || 'Upload failed';
    throw new Error(msg);
  }
  return data;
}
