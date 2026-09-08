const API_BASE = '/api';

/** Giriş — her gezek (admin/operator). Brauzer ýapylsa / login açylsa täzeden soralar. */
const Auth = {
  getToken() {
    return sessionStorage.getItem('token') || '';
  },
  getUser() {
    try {
      return JSON.parse(sessionStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  },
  setSession(token, user) {
    this.clearLegacy();
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
    if (user) sessionStorage.setItem('user', JSON.stringify(user));
    else sessionStorage.removeItem('user');
  },
  clear() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    this.clearLegacy();
  },
  clearLegacy() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch { /* ignore */ }
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },
};

const api = {
  async request(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { ...options.headers };
    const timeoutMs = Number(options.timeoutMs) || 0;

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const { timeoutMs: _t, ...fetchOpts } = options;
    let timer;
    const controller = timeoutMs ? new AbortController() : null;
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      fetchOpts.signal = controller.signal;
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, { ...fetchOpts, headers });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error('Wagt gutardy (tor haýal ýa-da suratlar köp). Azajyk faýl bilen synanyşyň.');
      }
      throw new Error('Serwer bilen baglanyşyk ýok. Serweriň işleýändigini barlaň (port 8000). IP bilen girýän bolsaňyz: http://SERWER_IP:8000');
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(res.ok ? 'Jogap okalmadý' : `Ýalňyşlyk (${res.status})`);
    }

    if (!res.ok) {
      if (res.status === 401) {
        Auth.clear();
      }
      const err = new Error(data.message || 'Sorag şowsuz boldy');
      err.status = res.status;
      err.data = data.data || null;
      throw err;
    }

    return data;
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, options);
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  },
};

function showAlert(container, message, type = 'success') {
  if (!container) {
    console.warn(message);
    return;
  }
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = message;
  container.prepend(el);
  setTimeout(() => el.remove(), 8000);
}

function formatDate(dateStr) {
  if (typeof formatDateTk === 'function') return formatDateTk(dateStr);
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function requireAuth() {
  Auth.clearLegacy();
  if (!Auth.isLoggedIn()) {
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

function logout() {
  Auth.clear();
  window.location.href = '/admin/login.html';
}

window.Auth = Auth;

/* ESC = yza (ähli sahypa) */
(function loadEscNav() {
  if (window.EscNav) return;
  const s = document.createElement('script');
  s.src = '/js/esc-nav.js?v=9';
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();
