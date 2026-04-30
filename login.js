import { api, toast } from './app.js?v=26';

// If already signed in, bounce to home
api.get('/api/auth/me').then(({ user }) => {
    if (user) location.href = user.familyId ? '/' : '/family';
}).catch(() => {});

const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Signing in…';
    try {
        const { user } = await api.post('/api/auth/login', { username, password });
        toast(`Welcome back, ${user.displayName}!`, 'success');
        setTimeout(() => { location.href = user.familyId ? '/' : '/family'; }, 350);
    } catch (err) {
        toast(err.message || 'Login failed', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = original;
    }
});
