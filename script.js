import { api, toast, capitalizeWords, openModal, closeModal, bindModalDismiss, renderHeader, renderBottomNav, requireUser } from './app.js?v=21';

let currentDate = new Date();
let meals = {};
let dishes = [];
let activeDateKey = null;

const els = {};

function fmtDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDateLong(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
    });
}

async function loadMeals() {
    try {
        meals = (await api.get('/api/meals')) || {};
    } catch {
        meals = {};
    }
}

async function loadDishes() {
    try {
        dishes = (await api.get('/api/dishes')) || [];
        dishes.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        dishes = [];
    }
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    els.currentMonth.textContent = firstDay.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long',
    });

    els.grid.innerHTML = '';
    const today = new Date();
    const todayKey = fmtDateKey(today);

    for (let i = 0; i < startingDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'day empty';
        els.grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'day';
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (dateKey === todayKey) cell.classList.add('today');
        if (meals[dateKey]) cell.classList.add('has-meal');

        const num = document.createElement('span');
        num.className = 'day-num';
        num.textContent = d;
        cell.appendChild(num);

        if (meals[dateKey]) {
            const meal = document.createElement('span');
            meal.className = 'meal';
            meal.textContent = meals[dateKey];
            cell.appendChild(meal);
        }

        cell.addEventListener('click', () => openMealModal(dateKey));
        els.grid.appendChild(cell);
    }
}

function renderDishPickList(query = '') {
    const q = query.trim().toLowerCase();
    const filtered = q
        ? dishes.filter((d) => d.name.toLowerCase().includes(q) || (d.tags || []).some((t) => t.toLowerCase().includes(q)))
        : dishes;
    const current = activeDateKey ? meals[activeDateKey] : null;

    els.pickList.innerHTML = '';
    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = q ? `No dishes match "${query}"` : 'No dishes saved yet. Add some in the Dish Library!';
        els.pickList.appendChild(li);
        return;
    }
    filtered.forEach((dish) => {
        const li = document.createElement('li');
        if (dish.name === current) li.classList.add('selected');
        const tagText = (dish.tags || []).slice(0, 2).map(capitalizeWords).join(' · ');
        li.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600;">${escapeHtml(capitalizeWords(dish.name))}</div>
                ${tagText ? `<div style="font-size:0.78rem; color: var(--text-muted);">${escapeHtml(tagText)}</div>` : ''}
            </div>
        `;
        li.addEventListener('click', () => pickDish(dish.name));
        els.pickList.appendChild(li);
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function pickDish(name) {
    if (!activeDateKey) return;
    try {
        await api.post('/api/meals', { date: activeDateKey, dishName: name });
        meals[activeDateKey] = name;
        renderCalendar();
        closeModal(els.modal);
        toast(`Saved ${capitalizeWords(name)} for ${formatDateLong(activeDateKey)}`, 'success');
    } catch (e) {
        toast(e.message || 'Could not save meal', 'error');
    }
}

async function clearMeal() {
    if (!activeDateKey) return;
    if (!meals[activeDateKey]) {
        closeModal(els.modal);
        return;
    }
    try {
        await api.del(`/api/meals/${activeDateKey}`);
        delete meals[activeDateKey];
        renderCalendar();
        closeModal(els.modal);
        toast('Meal cleared', 'info');
    } catch (e) {
        toast(e.message || 'Could not clear meal', 'error');
    }
}

async function pickRandom() {
    if (!dishes.length) {
        toast('Add some dishes first in the Dish Library!', 'info');
        return;
    }
    const random = dishes[Math.floor(Math.random() * dishes.length)];
    await pickDish(random.name);
}

function openMealModal(dateKey) {
    activeDateKey = dateKey;
    els.modalDate.textContent = formatDateLong(dateKey);
    els.search.value = '';
    const current = meals[dateKey];
    els.currentMealLabel.textContent = current ? `Currently: ${capitalizeWords(current)}` : 'No meal planned';
    renderDishPickList('');
    openModal(els.modal);
    setTimeout(() => els.search.focus(), 80);
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireUser();
    if (!user) return;

    renderHeader({ title: 'Meal Planner', icon: 'fa-calendar-days', user });
    renderBottomNav('home');

    els.currentMonth = document.getElementById('currentMonth');
    els.grid = document.getElementById('calendarGrid');
    els.modal = document.getElementById('addMealModal');
    els.modalDate = document.getElementById('modalDate');
    els.search = document.getElementById('dishSearch');
    els.pickList = document.getElementById('dishPickList');
    els.currentMealLabel = document.getElementById('currentMealLabel');

    bindModalDismiss(els.modal, document.getElementById('closeModal'));

    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    document.getElementById('todayBtn').addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar();
    });
    document.getElementById('randomMealButton').addEventListener('click', pickRandom);
    document.getElementById('clearMealBtn').addEventListener('click', clearMeal);
    els.search.addEventListener('input', (e) => renderDishPickList(e.target.value));
    els.search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = els.pickList.querySelector('li:not(.empty)');
            if (first) first.click();
        }
    });

    await Promise.all([loadMeals(), loadDishes()]);
    renderCalendar();
});
