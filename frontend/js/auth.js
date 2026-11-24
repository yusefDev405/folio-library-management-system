import { apiRequest, refreshSessionToken, setAccessToken } from './api.js';

let currentUser = null;
const listeners = new Set();

export function getUser() {
  return currentUser;
}

export function subscribeAuth(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(currentUser);
}

export function hasRole(role) {
  if (!currentUser) return false;
  if (role === 'librarian') {
    return currentUser.role === 'librarian' || currentUser.role === 'admin';
  }
  return currentUser.role === role;
}

export async function restoreSession() {
  try {
    const data = await refreshSessionToken();
    if (data?.user) {
      currentUser = data.user;
      notify();
      return currentUser;
    }
  } catch {
    // not logged in
  }
  currentUser = null;
  setAccessToken(null);
  notify();
  return null;
}

export async function login(email, password) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
    retryOn401: false,
  });
  setAccessToken(res.data.accessToken);
  currentUser = res.data.user;
  notify();
  return currentUser;
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      retryOn401: false,
    });
  } catch {
    // clear local session regardless
  }
  setAccessToken(null);
  currentUser = null;
  notify();
}

export function clearSessionLocally() {
  setAccessToken(null);
  currentUser = null;
  notify();
}
