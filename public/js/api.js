const TOKEN_KEY = 'lw.parentToken';

export const parentToken = {
  get() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t) {
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* egal */ }
  },
};

export async function api(path, { method = 'GET', body, parent = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (parent) headers['X-Parent-Token'] = parentToken.get() ?? '';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Keine Verbindung zum Server. Ist das WLAN an?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (parent && res.status === 401) parentToken.set(null);
    const err = new Error(data.error || `Fehler ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
