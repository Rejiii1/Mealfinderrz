import { api, cache, toast, capitalizeWords, renderHeader, renderBottomNav, requireUser, escapeHtml } from './app.js?v=24';

let groceryItems = []; // [{ name, totalQuantity, unit, haveIt, dishIds }]
let allDishes = [];

const els = {};

function pluralizeUnit(unit, quantity) {
    if (!unit) return '';
    if (quantity <= 1) return unit;
    const u = unit.toLowerCase();
    if (u === 'box') return 'Boxes';
    if (u.endsWith('s')) return unit;
    return unit + 's';
}

function computeGroceryItems(meals, dishes) {
    allDishes = dishes || [];
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const dishesByName = new Map((dishes || []).map((d) => [d.name, d]));
    const acc = {};

    for (const [dateStr, dishName] of Object.entries(meals || {})) {
        const t = new Date(dateStr).getTime();
        if (isNaN(t) || t < startOfToday) continue;
        const dish = dishesByName.get(dishName);
        if (!dish || !dish.ingredients) continue;
        for (const ing of Object.values(dish.ingredients)) {
            const cleanName = (ing.name || '').toLowerCase().trim();
            if (!cleanName) continue;
            const q = (ing.quantity || '').toString();
            const qtyMatch = q.match(/[\d.]+/);
            const unitMatch = q.match(/[a-zA-Z]+/);
            const qty = qtyMatch ? parseFloat(qtyMatch[0]) : 1;
            const unit = unitMatch ? unitMatch[0] : '';
            if (!acc[cleanName]) {
                acc[cleanName] = {
                    name: cleanName,
                    totalQuantity: 0,
                    unit: '',
                    haveIt: false,
                    dishIds: [],
                };
            }
            acc[cleanName].totalQuantity += isNaN(qty) ? 0 : qty;
            if (unit && !acc[cleanName].unit) acc[cleanName].unit = unit;
            acc[cleanName].haveIt = acc[cleanName].haveIt || !!ing.haveIt;
            if (!acc[cleanName].dishIds.includes(dish.id)) acc[cleanName].dishIds.push(dish.id);
        }
    }

    groceryItems = Object.values(acc).sort((a, b) => {
        if (a.haveIt !== b.haveIt) return a.haveIt ? 1 : -1;
        return a.name.localeCompare(b.name);
    });
}

async function buildList() {
    const cachedMeals = cache.get('GET:/api/meals');
    const cachedDishes = cache.get('GET:/api/dishes');
    const haveCache = cachedMeals !== null && cachedMeals !== undefined && cachedDishes !== null && cachedDishes !== undefined;

    if (haveCache) {
        computeGroceryItems(cachedMeals, cachedDishes);
        render();
    } else {
        els.wrap.innerHTML = `
            <div class="skel" style="height: 64px; margin-bottom: 8px;"></div>
            <div class="skel" style="height: 64px; margin-bottom: 8px;"></div>
            <div class="skel" style="height: 64px; margin-bottom: 8px;"></div>
        `;
    }

    try {
        const [meals, dishes] = await Promise.all([
            api.get('/api/meals').then((d) => { cache.set('GET:/api/meals', d); return d; }).catch(() => ({})),
            api.get('/api/dishes').then((d) => { cache.set('GET:/api/dishes', d); return d; }).catch(() => []),
        ]);
        const sameMeals = haveCache && JSON.stringify(meals) === JSON.stringify(cachedMeals);
        const sameDishes = haveCache && JSON.stringify(dishes) === JSON.stringify(cachedDishes);
        if (haveCache && sameMeals && sameDishes) return;
        computeGroceryItems(meals, dishes);
        render();
    } catch (e) {
        if (!haveCache) {
            els.wrap.innerHTML = `<div class="empty-state"><div class="icon"><i class="fas fa-exclamation-triangle"></i></div><h3>Could not load list</h3><p>${escapeHtml(e.message)}</p></div>`;
        }
    }
}

function updateStats() {
    const total = groceryItems.length;
    const got = groceryItems.filter((i) => i.haveIt).length;
    els.stats.textContent = total === 0 ? 'No ingredients needed' : `${got} of ${total} got it`;
}

function buildItemNode(item) {
    const li = document.createElement('li');
    li.dataset.name = item.name;
    if (item.haveIt) li.classList.add('checked');
    const qtyText = item.totalQuantity > 0
        ? `${item.totalQuantity}${item.unit ? ' ' + pluralizeUnit(item.unit, item.totalQuantity) : ''}`
        : '';
    li.innerHTML = `
        <input type="checkbox" class="grocery-checkbox" ${item.haveIt ? 'checked' : ''} aria-label="Got ${escapeHtml(item.name)}" />
        <span class="name">${escapeHtml(capitalizeWords(item.name))}</span>
        ${qtyText ? `<span class="qty">${escapeHtml(qtyText)}</span>` : ''}
    `;
    const cb = li.querySelector('input');
    li.addEventListener('click', (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        onToggle(item.name, cb.checked, li);
    });
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => onToggle(item.name, cb.checked, li));
    return li;
}

function render() {
    if (groceryItems.length === 0) {
        els.wrap.innerHTML = `
            <div class="empty-state">
                <div class="icon"><i class="fas fa-shopping-basket" aria-hidden="true"></i></div>
                <h3>Nothing to buy</h3>
                <p>Plan some meals on the calendar — ingredients will show up here.</p>
                <a href="/" class="btn"><i class="fas fa-calendar-days" aria-hidden="true"></i> Open calendar</a>
            </div>
        `;
        updateStats();
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'grocery-list';
    groceryItems.forEach((item) => ul.appendChild(buildItemNode(item)));
    els.wrap.innerHTML = '';
    els.wrap.appendChild(ul);
    updateStats();
}

let pendingPersist = null;
async function onToggle(name, checked, liNode) {
    const item = groceryItems.find((i) => i.name === name);
    if (!item) return;
    item.haveIt = checked;
    liNode.classList.toggle('checked', checked);
    updateStats();

    // Patch in-memory dishes so the cache stays consistent.
    for (const dishId of item.dishIds) {
        const dish = allDishes.find((d) => d.id === dishId);
        if (!dish || !dish.ingredients) continue;
        for (const [key, val] of Object.entries(dish.ingredients)) {
            if ((val.name || '').toLowerCase() === item.name.toLowerCase()) {
                dish.ingredients[key].haveIt = checked;
            }
        }
    }
    cache.set('GET:/api/dishes', allDishes);

    // Coalesce rapid taps into a single network round-trip per dish.
    if (pendingPersist) clearTimeout(pendingPersist);
    pendingPersist = setTimeout(async () => {
        pendingPersist = null;
        try {
            const dirtyIds = new Set(item.dishIds);
            await Promise.all(
                Array.from(dirtyIds).map((id) => {
                    const d = allDishes.find((x) => x.id === id);
                    return d ? api.put(`/api/dishes/${d.id}`, d) : null;
                })
            );
        } catch (e) {
            toast(e.message || 'Could not save change', 'error');
        }
    }, 350);
}

async function clearAll() {
    if (!confirm("Reset 'Got it' status for every ingredient?")) return;
    try {
        for (const dish of allDishes) {
            let modified = false;
            if (dish.ingredients) {
                for (const k in dish.ingredients) {
                    if (dish.ingredients[k].haveIt) {
                        dish.ingredients[k].haveIt = false;
                        modified = true;
                    }
                }
            }
            if (modified) await api.put(`/api/dishes/${dish.id}`, dish);
        }
        cache.set('GET:/api/dishes', allDishes);
        toast('List reset', 'info');
        await buildList();
    } catch (e) {
        toast(e.message || 'Could not reset', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireUser();
    if (!user) return;
    renderHeader({ title: 'Grocery List', icon: 'fa-list-check', user });
    renderBottomNav('grocery');
    els.wrap = document.getElementById('groceryListWrap');
    els.stats = document.getElementById('groceryStats');
    document.getElementById('clearGroceryList').addEventListener('click', clearAll);
    await buildList();
});
