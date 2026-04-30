import { api, toast, renderHeader, renderBottomNav, requireUser, escapeHtml, getTheme, setTheme } from './app.js?v=26';

let me;

async function load() {
    const root = document.getElementById('content');
    root.innerHTML = '<div class="skel" style="height: 220px;"></div>';
    try {
        const { family } = await api.get('/api/family');
        if (!family) renderNoFamily(root);
        else renderFamily(root, family);
    } catch (e) {
        root.innerHTML = `<div class="empty-state"><div class="icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></div><h3>Could not load</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
    renderAppearance(root);
}

function renderAppearance(root) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '14px';
    const current = getTheme();
    card.innerHTML = `
        <h2 class="page-title" style="margin-top:0;"><i class="fas fa-palette" aria-hidden="true" style="color: var(--brand-blue);"></i> Appearance</h2>
        <p class="help" style="margin: -4px 0 10px;">Switch between light, dark, or follow your device.</p>
        <div class="theme-switcher" role="radiogroup" aria-label="Theme">
            <button type="button" data-theme="system" role="radio" aria-checked="${current === 'system'}" class="${current === 'system' ? 'active' : ''}">
                <i class="fas fa-circle-half-stroke" aria-hidden="true"></i> System
            </button>
            <button type="button" data-theme="light" role="radio" aria-checked="${current === 'light'}" class="${current === 'light' ? 'active' : ''}">
                <i class="fas fa-sun" aria-hidden="true"></i> Light
            </button>
            <button type="button" data-theme="dark" role="radio" aria-checked="${current === 'dark'}" class="${current === 'dark' ? 'active' : ''}">
                <i class="fas fa-moon" aria-hidden="true"></i> Dark
            </button>
        </div>
    `;
    root.appendChild(card);
    const buttons = card.querySelectorAll('.theme-switcher button');
    buttons.forEach((b) => {
        b.addEventListener('click', () => {
            const theme = b.dataset.theme;
            setTheme(theme);
            buttons.forEach((x) => {
                const on = x === b;
                x.classList.toggle('active', on);
                x.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        });
    });
}

function renderNoFamily(root) {
    root.innerHTML = `
        <div class="card">
            <h2 class="page-title"><i class="fas fa-users" style="color: var(--brand-blue);" aria-hidden="true"></i> You aren't in a family yet</h2>
            <p class="help">Create a new family to get a shared calendar &amp; dish library, or join one with an invite code.</p>

            <div class="auth-tabs" style="margin-top: 14px;" role="tablist">
                <button type="button" data-action="create" class="active">Create family</button>
                <button type="button" data-action="join">Join with code</button>
            </div>

            <div id="createBlock" style="margin-top: 14px;">
                <div class="field">
                    <label for="newFamilyName">Family name</label>
                    <input class="input" id="newFamilyName" placeholder="The Jacksons" maxlength="64" />
                </div>
                <button class="btn btn-block" id="createFamilyBtn" style="margin-top: 12px;">
                    <i class="fas fa-house-chimney" aria-hidden="true"></i> Create family
                </button>
            </div>

            <div id="joinBlock" style="display:none; margin-top: 14px;">
                <div class="field">
                    <label for="joinCode">Invite code</label>
                    <input class="input" id="joinCode" placeholder="ABC123" maxlength="6" style="text-transform: uppercase; letter-spacing: 4px; font-family: ui-monospace, monospace;" />
                </div>
                <button class="btn btn-block btn-yellow" id="joinFamilyBtn" style="margin-top: 12px;">
                    <i class="fas fa-sign-in-alt" aria-hidden="true"></i> Join family
                </button>
            </div>
        </div>
    `;

    const tabs = root.querySelectorAll('.auth-tabs button');
    const createBlock = root.querySelector('#createBlock');
    const joinBlock = root.querySelector('#joinBlock');
    tabs.forEach((b) => b.addEventListener('click', () => {
        tabs.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const create = b.dataset.action === 'create';
        createBlock.style.display = create ? '' : 'none';
        joinBlock.style.display = create ? 'none' : '';
    }));

    root.querySelector('#createFamilyBtn').addEventListener('click', async () => {
        const name = root.querySelector('#newFamilyName').value.trim();
        try {
            await api.post('/api/family', { name });
            toast('Family created!', 'success');
            setTimeout(() => location.href = '/', 350);
        } catch (e) {
            toast(e.message || 'Could not create family', 'error');
        }
    });
    root.querySelector('#joinFamilyBtn').addEventListener('click', async () => {
        const inviteCode = root.querySelector('#joinCode').value.trim().toUpperCase();
        try {
            await api.post('/api/family/join', { inviteCode });
            toast('Joined family!', 'success');
            setTimeout(() => location.href = '/', 350);
        } catch (e) {
            toast(e.message || 'Could not join', 'error');
        }
    });
}

function renderFamily(root, family) {
    const isOwner = family.ownerId === me.id;
    const initials = (n) => (n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    const memberItems = family.members.map((m) => `
        <li>
            <div class="avatar">${escapeHtml(initials(m.displayName))}</div>
            <div>
                <div class="name">${escapeHtml(m.displayName)} ${m.id === me.id ? '<span class="meta">· you</span>' : ''}</div>
                <div class="meta">@${escapeHtml(m.username)}</div>
            </div>
            ${m.id === family.ownerId ? '<span class="owner-tag">Owner</span>' : ''}
        </li>
    `).join('');

    root.innerHTML = `
        <div class="card family-card">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <h2 class="page-title" style="margin:0;"><i class="fas fa-users" style="color: var(--brand-blue);" aria-hidden="true"></i> ${escapeHtml(family.name)}</h2>
                ${isOwner ? '<button id="renameBtn" class="btn btn-ghost btn-sm"><i class="fas fa-pencil" aria-hidden="true"></i> Rename</button>' : ''}
            </div>

            <div class="invite-row">
                <div>
                    <div class="label">Invite code</div>
                    <code>${escapeHtml(family.inviteCode)}</code>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-secondary btn-sm" id="copyCodeBtn"><i class="fas fa-copy" aria-hidden="true"></i> Copy</button>
                    ${isOwner ? '<button class="btn btn-ghost btn-sm" id="regenBtn" title="New code" aria-label="New invite code"><i class="fas fa-rotate" aria-hidden="true"></i></button>' : ''}
                </div>
            </div>

            <div class="section-title">Members (${family.members.length})</div>
            <ul class="member-list">${memberItems}</ul>

            <div class="divider"></div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                <button class="btn btn-ghost" id="accountBtn"><i class="fas fa-user-cog" aria-hidden="true"></i> Account</button>
                <button class="btn btn-danger" id="leaveBtn"><i class="fas fa-door-open" aria-hidden="true"></i> Leave family</button>
            </div>
        </div>

        <div id="accountPanel" class="card" style="margin-top:14px; display:none;">
            <h2 class="page-title" style="margin-top:0;"><i class="fas fa-user-cog" aria-hidden="true"></i> Account</h2>
            <div class="field">
                <label for="acctDisplayName">Display name</label>
                <input class="input" id="acctDisplayName" value="${escapeHtml(me.displayName)}" maxlength="64" />
            </div>
            <div class="section-title">Change password</div>
            <div class="field">
                <label for="acctCurrent">Current password</label>
                <input class="input" id="acctCurrent" type="password" autocomplete="current-password" />
            </div>
            <div class="field">
                <label for="acctNew">New password</label>
                <input class="input" id="acctNew" type="password" autocomplete="new-password" />
            </div>
            <button class="btn" id="saveAcctBtn" style="margin-top: 10px;"><i class="fas fa-check" aria-hidden="true"></i> Save changes</button>
        </div>
    `;

    root.querySelector('#copyCodeBtn').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(family.inviteCode);
            toast('Invite code copied', 'success');
        } catch {
            toast(family.inviteCode, 'info');
        }
    });

    const regen = root.querySelector('#regenBtn');
    if (regen) regen.addEventListener('click', async () => {
        if (!confirm('Generate a new invite code? The old one will stop working.')) return;
        try {
            const { inviteCode } = await api.post('/api/family/regenerate-code', {});
            toast(`New code: ${inviteCode}`, 'success', 4500);
            load();
        } catch (e) {
            toast(e.message || 'Could not regenerate', 'error');
        }
    });

    const rename = root.querySelector('#renameBtn');
    if (rename) rename.addEventListener('click', async () => {
        const name = prompt('New family name:', family.name);
        if (!name || !name.trim()) return;
        try {
            await api.put('/api/family', { name: name.trim() });
            toast('Family renamed', 'success');
            load();
        } catch (e) {
            toast(e.message || 'Could not rename', 'error');
        }
    });

    root.querySelector('#leaveBtn').addEventListener('click', async () => {
        const msg = family.members.length === 1
            ? 'You are the only member. Leaving will permanently delete this family and all of its meals, dishes, and tags. Continue?'
            : 'Leave this family? You will lose access to its calendar and dish library (other members keep them).';
        if (!confirm(msg)) return;
        try {
            await api.post('/api/family/leave', {});
            toast('Left family', 'info');
            setTimeout(() => location.reload(), 350);
        } catch (e) {
            toast(e.message || 'Could not leave', 'error');
        }
    });

    const acctBtn = root.querySelector('#accountBtn');
    const acctPanel = root.querySelector('#accountPanel');
    acctBtn.addEventListener('click', () => {
        acctPanel.style.display = acctPanel.style.display === 'none' ? '' : 'none';
        if (acctPanel.style.display === '') acctPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.querySelector('#saveAcctBtn').addEventListener('click', async () => {
        const displayName = root.querySelector('#acctDisplayName').value.trim();
        const currentPassword = root.querySelector('#acctCurrent').value;
        const newPassword = root.querySelector('#acctNew').value;
        const payload = { displayName };
        if (newPassword) { payload.currentPassword = currentPassword; payload.newPassword = newPassword; }
        try {
            const res = await api.put('/api/account', payload);
            me = res.user;
            toast('Saved', 'success');
            root.querySelector('#acctCurrent').value = '';
            root.querySelector('#acctNew').value = '';
            renderHeader({ title: 'Settings', icon: 'fa-gear', user: me });
        } catch (e) {
            toast(e.message || 'Could not save', 'error');
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    me = await requireUser();
    if (!me) return;
    renderHeader({ title: 'Settings', icon: 'fa-gear', user: me });
    renderBottomNav('');
    await load();
});
