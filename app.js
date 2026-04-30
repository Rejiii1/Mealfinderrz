// Shared client utilities — toasts, fetch wrapper, modal helpers, auth.

// ─── Theme: system / light / dark ───────────────────────────────────
// Applied as `<html data-theme="…">`. CSP forbids inline scripts, so this
// runs at module-import time (before any of the page modules render).

const THEME_KEY = 'mfz:theme';
export const THEMES = ['system', 'light', 'dark'];

export function getTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return THEMES.includes(v) ? v : 'system';
    } catch {
        return 'system';
    }
}

export function setTheme(theme) {
    if (!THEMES.includes(theme)) theme = 'system';
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    applyTheme(theme);
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
}

applyTheme(getTheme());

// ─── Service worker (snappy tab-switching on iPhone) ────────────────

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

// ─── Stale-while-revalidate cache for GETs ──────────────────────────

const CACHE_PREFIX = 'mfz:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 1 day

export const cache = {
    get(key) {
        try {
            const raw = sessionStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            const { ts, value } = JSON.parse(raw);
            if (Date.now() - ts > CACHE_TTL_MS) return null;
            return value;
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), value }));
        } catch {}
    },
    clear() {
        try {
            const keys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
            }
            keys.forEach((k) => sessionStorage.removeItem(k));
        } catch {}
    },
};

export const api = {
    async request(path, opts = {}) {
        const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
        if (opts.body && typeof opts.body !== 'string') {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        const res = await fetch(path, { credentials: 'same-origin', ...opts, headers });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
        if (!res.ok) {
            if (res.status === 401) {
                cache.clear();
                if (!location.pathname.startsWith('/login')) {
                    location.href = '/login';
                }
            }
            const msg = (data && data.error) || `Request failed (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    },
    get: (p) => api.request(p),
    post: (p, body) => api.request(p, { method: 'POST', body }),
    put: (p, body) => api.request(p, { method: 'PUT', body }),
    del: (p) => api.request(p, { method: 'DELETE' }),
};

// Stale-while-revalidate GET. Returns the cached value immediately if present
// (or awaits the network if not), and calls onFresh(data) later if the network
// response differs from the cached one. Use this for snappy first-paint.
export async function cachedGet(path, onFresh) {
    const key = 'GET:' + path;
    const cached = cache.get(key);
    const networkPromise = api
        .get(path)
        .then((data) => {
            cache.set(key, data);
            return data;
        });

    if (cached !== null && cached !== undefined) {
        networkPromise
            .then((fresh) => {
                if (typeof onFresh === 'function' && JSON.stringify(fresh) !== JSON.stringify(cached)) {
                    onFresh(fresh);
                }
            })
            .catch(() => {});
        return cached;
    }
    return networkPromise;
}

// ─── Shared HTML escape + debounce utilities ────────────────────────

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function debounce(fn, wait = 150) {
    let t;
    const wrapped = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
}

// ─── Toasts ──────────────────────────────────────────────────────────

let toastHost;
function ensureToastHost() {
    if (toastHost) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
    return toastHost;
}

export function toast(message, type = 'info', duration = 2800) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 240);
    }, duration);
}

// ─── Capitalization helper ──────────────────────────────────────────

export function capitalizeWords(str) {
    if (!str) return '';
    return str
        .split(' ')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
        .join(' ');
}

// ─── Modal helpers ──────────────────────────────────────────────────

export function openModal(el) {
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
}
export function closeModal(el) {
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
}
export function bindModalDismiss(modal, ...closers) {
    if (!modal) return;
    closers.forEach((c) => c && c.addEventListener('click', () => closeModal(modal)));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(modal);
    });
}

// ─── Header + bottom nav builders ───────────────────────────────────

export function renderHeader({ title, icon = 'fa-utensils', user } = {}) {
    const header = document.querySelector('header.app-header');
    if (!header) return;
    const safeIcon = /^fa-[a-z0-9-]+$/.test(icon) ? icon : 'fa-utensils';
    header.innerHTML = `
      <div class="brand">
        <div class="brand-icon"><i class="fas ${safeIcon}" aria-hidden="true"></i></div>
        <h1>${escapeHtml(title || 'MealFinderrz')}</h1>
      </div>
      <div class="header-actions">
        ${user
            ? `<a href="/family" class="icon-btn" title="Settings" aria-label="Settings"><i class="fas fa-gear" aria-hidden="true"></i></a>
               <button id="logoutBtn" class="icon-btn" title="Log out" aria-label="Log out"><i class="fas fa-sign-out-alt" aria-hidden="true"></i></button>`
            : ''}
      </div>
    `;
    const logoutBtn = header.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await api.post('/api/auth/logout', {});
            } finally {
                cache.clear();
                location.href = '/login';
            }
        });
    }
}

export function renderBottomNav(active) {
    const nav = document.querySelector('nav.bottom-nav');
    if (!nav) return;
    const items = [
        { key: 'dishes', href: '/dishes', icon: 'fa-book', label: 'Dishes' },
        { key: 'home', href: '/', icon: 'fa-calendar-days', label: 'Calendar' },
        { key: 'grocery', href: '/grocery', icon: 'fa-list-check', label: 'Grocery' },
    ];
    nav.innerHTML = items
        .map(
            (it) => `
        <a href="${it.href}" class="${it.key === active ? 'active' : ''}" aria-label="${it.label}"${it.key === active ? ' aria-current="page"' : ''}>
          <i class="fas ${it.icon}" aria-hidden="true"></i>
          <span class="label">${it.label}</span>
        </a>`
        )
        .join('');
}

// ─── Auth bootstrap ─────────────────────────────────────────────────

export async function requireUser() {
    const cached = cache.get('user');
    const revalidate = async () => {
        try {
            const { user } = await api.get('/api/auth/me');
            if (!user) {
                cache.clear();
                location.href = '/login';
                return null;
            }
            cache.set('user', user);
            if (!user.familyId && !location.pathname.startsWith('/family')) {
                location.href = '/family';
            }
            return user;
        } catch {
            return null;
        }
    };

    if (cached) {
        // Return cached user immediately so the page paints without waiting
        // for the network. Verify in the background and only redirect on a
        // confirmed 401 (auth wrapper handles that).
        revalidate();
        if (!cached.familyId && !location.pathname.startsWith('/family')) {
            location.href = '/family';
            return cached;
        }
        return cached;
    }

    try {
        const { user } = await api.get('/api/auth/me');
        if (!user) {
            location.href = '/login';
            return null;
        }
        cache.set('user', user);
        if (!user.familyId && !location.pathname.startsWith('/family')) {
            location.href = '/family';
            return user;
        }
        return user;
    } catch {
        location.href = '/login';
        return null;
    }
}
