const ERROR_MESSAGES = {
  COPY_NOT_FOUND: 'No physical copy matches that barcode.',
  MEMBER_NOT_FOUND: 'Member account was not found.',
  BOOK_NOT_FOUND: 'Book record was not found.',
  NO_ACTIVE_LOAN: 'No active loan was found for that copy.',
  MEMBER_NOT_ACTIVE: 'This member account is suspended or membership has expired.',
  LOAN_LIMIT_REACHED: 'This member has reached their maximum simultaneous loan limit.',
  UNPAID_FINES: 'Unpaid fines exceed the policy allowance for borrowing or renewal.',
  COPY_RESERVED: 'This copy is held on the shelf for another waiting member.',
  COPY_NOT_AVAILABLE: 'This physical copy is not available for checkout.',
  RENEWAL_LIMIT_REACHED: 'This loan has reached the maximum number of renewals.',
  LOAN_OVERDUE: 'Overdue loans cannot be renewed; return the item at the desk.',
  BOOK_HAS_RESERVATIONS: 'Renewal blocked because another member is waiting for this title.',
  COPY_AVAILABLE_NO_RESERVE: 'Copies are currently available on the shelf; no reservation is needed.',
  RESERVATION_EXISTS: 'You already have an active reservation for this title.',
  FINE_ALREADY_SETTLED: 'This fine has already been paid or waived.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  RATE_LIMITED: 'Too many requests; please wait briefly and try again.',
};

let accessToken = null;
let refreshPromise = null;
let onUnauthorizedHandler = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setOnUnauthorized(handler) {
  onUnauthorizedHandler = handler;
}

export function formatServerError(errPayload) {
  if (!errPayload) return 'Request failed.';
  if (errPayload.code && ERROR_MESSAGES[errPayload.code]) {
    return ERROR_MESSAGES[errPayload.code];
  }
  if (Array.isArray(errPayload.details) && errPayload.details.length > 0) {
    return `${errPayload.message} (${errPayload.details.map((d) => `${d.path}: ${d.message}`).join('; ')})`;
  }
  return errPayload.message || 'Request failed.';
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function refreshSessionToken() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const json = await res.json();
        accessToken = json.data?.accessToken ?? null;
        return json.data ?? null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, retryOn401 = true } = {}) {
  const reqHeaders = { ...headers };
  if (accessToken) {
    reqHeaders.Authorization = `Bearer ${accessToken}`;
  }
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (
    res.status === 401 &&
    retryOn401 &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await refreshSessionToken();
    if (refreshed?.accessToken) {
      return apiRequest(path, { method, body, headers, retryOn401: false });
    }
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
  }

  if (res.status === 204) {
    return null;
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const errObj = json?.error || { code: 'HTTP_ERROR', message: res.statusText };
    throw new ApiError(res.status, errObj.code, formatServerError(errObj), errObj.details);
  }
  return json;
}
