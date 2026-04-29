// Shared client utilities — toasts, fetch wrapper, modal helpers, auth.

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
    header.innerHTML = `
      <div class="brand">
        <div class="brand-icon"><i class="fas ${icon}"></i></div>
        <h1>${title || 'MealFinderrz'}</h1>
      </div>
      <div class="header-actions">
        ${user
            ? `<a href="/family" class="icon-btn" title="Settings" aria-label="Settings"><i class="fas fa-gear"></i></a>
               <button id="logoutBtn" class="icon-btn" title="Log out" aria-label="Log out"><i class="fas fa-sign-out-alt"></i></button>`
            : ''}
      </div>
    `;
    const logoutBtn = header.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await api.post('/api/auth/logout', {});
            } finally {
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
        <a href="${it.href}" class="${it.key === active ? 'active' : ''}" aria-label="${it.label}">
          <i class="fas ${it.icon}"></i>
          <span class="label">${it.label}</span>
        </a>`
        )
        .join('');
}

// ─── Auth bootstrap ─────────────────────────────────────────────────

export async function requireUser() {
    try {
        const { user } = await api.get('/api/auth/me');
        if (!user) {
            location.href = '/login';
            return null;
        }
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
