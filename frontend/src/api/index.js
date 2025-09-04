// src/api/index.js
import { apiGet, apiPost, apiPatch, apiDelete, apiUploadPost } from './apiClient';
import { BASE_URL } from '../config';
import { getTokens } from './tokenStore';

// ---------- Auth ----------
export const signup   = (data) => apiPost('/auth/signup', data);
export const login    = (data) => apiPost('/auth/login', data);
export const getMe    = () => apiGet('/me');
export const updateMe = (data) => apiPatch('/me', data);
export const setRole  = (role) => apiPatch('/me/role', { role });

export const loginWithGoogle   = (data) => apiPost('/auth/oauth/google', data);
export const loginWithApple    = (data) => apiPost('/auth/oauth/apple', data);
export const loginWithFacebook = (data) => apiPost('/auth/oauth/facebook', data);

// ---------- Helpers ----------
const qs = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
};

// ---------- Posts ----------
export const listPosts  = async (params = {}) => {
  const data = await apiGet(`/posts${qs(params)}`);
  data.posts = (data.posts || []).map(p => ({
    ...p,
    likes: p.likesCount,
    liked: p.likedByMe,
  }));
  return data;
};
export const getPost    = (id) => apiGet(`/posts/${id}`);
export const createPost = (title, content, lat, lng, files = []) =>
  apiUploadPost('/posts', { title, content, lat, lng, files });
export const addComment = (id, text) => apiPost(`/posts/${id}/comments`, { text });
export const likePost   = (id) => apiPost(`/posts/${id}/like`, {});
export const unlikePost = (id) => apiDelete(`/posts/${id}/like`, {});
export const favoritePost   = (id) => apiPost(`/posts/${id}/favorite`, {});
export const unfavoritePost = (id) => apiDelete(`/posts/${id}/favorite`, {});

// ---------- Freestyle /q ----------
export const insertOne = (req) => apiPost('/q/insertOne', req);
export const find      = (req) => apiPost('/q/find', req);
export const updateOne = (req) => apiPost('/q/updateOne', req);
export const deleteOne = (req) => apiPost('/q/deleteOne', req);
export const aggregate = (req) => apiPost('/q/aggregate', req);

// ---------- Groups ----------
export const createGroup  = (data) => apiPost('/groups', data);
export const listGroups   = (params) => apiGet(`/groups${qs(params)}`);
export const getGroup     = (id) => apiGet(`/groups/${id}`);
export const joinGroup    = (id) => apiPost(`/groups/${id}/join`, {});
export const leaveGroup   = (id) => apiPost(`/groups/${id}/leave`, {});
export const groupMembers = (id) => apiGet(`/groups/${id}/members`);

// ---------- Events ----------
export const createEvent = (data) => apiPost('/events', data);
export const listEvents  = (params) => apiGet(`/events${qs(params)}`);
export const getEvent    = (id) => apiGet(`/events/${id}`);
export const rsvpEvent   = (id, status) => apiPost(`/events/${id}/rsvp`, { status });

// ---------- Invitations ----------
export const acceptInvitation = (token) => apiPost('/invitations/accept', { token });

// ---------- Chat ----------
export const createChat   = (payload) => apiPost('/chats', payload);
export const listChats    = (params) => apiGet(`/chats${qs(params)}`);
export const sendMessage  = (chatId, text) => apiPost(`/chats/${chatId}/messages`, { text });
export const listMessages = (chatId, params) => apiGet(`/chats/${chatId}/messages${qs(params)}`);

// ---------- Media helper (native Image auth) ----------
export async function imageSource(pathOrUrl) {
  const url = pathOrUrl?.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const tokens = await getTokens();
  const token = tokens?.accessToken;
  return token
    ? { uri: url, headers: { Authorization: `Bearer ${token}` } }
    : { uri: url };
}
