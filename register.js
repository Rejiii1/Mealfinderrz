import { api, toast } from './app.js?v=26';

api.get('/api/auth/me').then(({ user }) => {
    if (user) location.href = user.familyId ? '/' : '/family';
}).catch(() => {});

let familyAction = 'create';
const tabs = document.querySelectorAll('.auth-tabs button');
const familyNameField = document.getElementById('familyNameField');
const inviteCodeField = document.getElementById('inviteCodeField');

tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
        tabs.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        familyAction = btn.dataset.action;
        familyNameField.style.display = familyAction === 'create' ? '' : 'none';
        inviteCodeField.style.display = familyAction === 'join' ? '' : 'none';
    });
});

const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        displayName: document.getElementById('displayName').value.trim(),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        familyAction,
        familyName: document.getElementById('familyName').value.trim(),
        inviteCode: document.getElementById('inviteCode').value.trim(),
    };
    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Creating…';
    try {
        const { user } = await api.post('/api/auth/register', payload);
        toast(`Welcome, ${user.displayName}!`, 'success');
        setTimeout(() => { location.href = user.familyId ? '/' : '/family'; }, 400);
    } catch (err) {
        toast(err.message || 'Could not create account', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = original;
    }
});
