import { api, toast, capitalizeWords, openModal, closeModal, bindModalDismiss, renderHeader, renderBottomNav, requireUser } from './app.js?v=20';

let allDishes = [];
let allTags = [];
let activeTagFilter = '';
let searchQuery = '';
let editingDish = null; // null when adding
let workingIngredients = {}; // { id: {name, quantity, haveIt} }
let workingTags = []; // [name]

const els = {};

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadAll() {
    [allDishes, allTags] = await Promise.all([
        api.get('/api/dishes').catch(() => []),
        api.get('/api/tags').catch(() => []),
    ]);
    allDishes.sort((a, b) => a.name.localeCompare(b.name));
    allTags.sort((a, b) => a.name.localeCompare(b.name));
    renderTagFilter();
    renderDishes();
}

function renderTagFilter() {
    els.tagFilter.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.className = `tag-chip ${activeTagFilter === '' ? 'active' : ''}`;
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
        activeTagFilter = '';
        renderTagFilter();
        renderDishes();
    });
    els.tagFilter.appendChild(allChip);

    allTags.forEach((tag) => {
        const chip = document.createElement('button');
        chip.className = `tag-chip ${activeTagFilter === tag.name ? 'active' : ''}`;
        chip.textContent = capitalizeWords(tag.name);
        chip.addEventListener('click', () => {
            activeTagFilter = activeTagFilter === tag.name ? '' : tag.name;
            renderTagFilter();
            renderDishes();
        });
        els.tagFilter.appendChild(chip);
    });
}

function renderDishes() {
    const q = searchQuery.toLowerCase();
    let list = allDishes.filter((d) => {
        if (activeTagFilter && !(d.tags || []).map((t) => t.toLowerCase()).includes(activeTagFilter.toLowerCase())) return false;
        if (q) {
            const inName = d.name.toLowerCase().includes(q);
            const inTags = (d.tags || []).some((t) => t.toLowerCase().includes(q));
            const inIng = Object.values(d.ingredients || {}).some((i) => (i.name || '').toLowerCase().includes(q));
            if (!inName && !inTags && !inIng) return false;
        }
        return true;
    });

    if (list.length === 0) {
        els.dishList.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon"><i class="fas fa-utensils"></i></div>
                <h3>${allDishes.length === 0 ? 'No dishes yet' : 'No matches'}</h3>
                <p>${allDishes.length === 0 ? 'Add your first dish to start planning meals.' : 'Try a different search or filter.'}</p>
                ${allDishes.length === 0 ? '<button class="btn" id="emptyAddBtn"><i class="fas fa-plus"></i> Add a dish</button>' : ''}
            </div>
        `;
        const empty = document.getElementById('emptyAddBtn');
        if (empty) empty.addEventListener('click', () => openDishModal(null));
        return;
    }

    els.dishList.innerHTML = '';
    list.forEach((dish) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'dish-card';
        const tags = (dish.tags || []).slice(0, 3).map((t) => `<span class="pill">${escapeHtml(capitalizeWords(t))}</span>`).join('');
        card.innerHTML = `
            <h3>${escapeHtml(capitalizeWords(dish.name))}</h3>
            ${tags ? `<div class="dish-tags">${tags}</div>` : ''}
        `;
        card.addEventListener('click', () => openDishModal(dish));
        els.dishList.appendChild(card);
    });
}

function openDishModal(dish) {
    editingDish = dish;
    els.dishModalTitle.textContent = dish ? 'Edit dish' : 'New dish';
    els.dishName.value = dish ? dish.name : '';
    workingIngredients = dish ? JSON.parse(JSON.stringify(dish.ingredients || {})) : {};
    workingTags = dish ? [...(dish.tags || [])] : [];
    renderIngredients();
    renderWorkingTags();
    populateTagPicker();
    els.deleteDishBtn.style.display = dish ? '' : 'none';
    openModal(els.dishModal);
    setTimeout(() => els.dishName.focus(), 80);
}

function renderIngredients() {
    els.ingList.innerHTML = '';
    const entries = Object.entries(workingIngredients);
    if (entries.length === 0) {
        const li = document.createElement('li');
        li.style.justifyContent = 'center';
        li.style.color = 'var(--text-muted)';
        li.style.fontStyle = 'italic';
        li.textContent = 'No ingredients yet';
        els.ingList.appendChild(li);
        return;
    }
    entries.forEach(([id, ing]) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="ing-name">${escapeHtml(capitalizeWords(ing.name))}</span>
            <span class="ing-qty">${escapeHtml(ing.quantity || '')}</span>
            <span class="actions">
                <button data-action="remove" data-id="${id}" class="danger" title="Remove"><i class="fas fa-times"></i></button>
            </span>
        `;
        els.ingList.appendChild(li);
    });
    els.ingList.querySelectorAll('button[data-action="remove"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            delete workingIngredients[btn.dataset.id];
            renderIngredients();
        });
    });
}

function addIngredient() {
    const name = els.ingName.value.trim();
    const qty = els.ingQty.value.trim();
    if (!name) {
        toast('Ingredient name required', 'error');
        return;
    }
    const id = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    workingIngredients[id] = { name: name.toLowerCase(), quantity: qty || '1', haveIt: false };
    els.ingName.value = '';
    els.ingQty.value = '';
    els.ingName.focus();
    renderIngredients();
}

function renderWorkingTags() {
    els.dishTagList.innerHTML = '';
    workingTags.forEach((t, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fas fa-tag" style="font-size:0.7rem;"></i> ${escapeHtml(capitalizeWords(t))} <button class="remove" data-i="${i}" aria-label="Remove tag">&times;</button>`;
        els.dishTagList.appendChild(li);
    });
    els.dishTagList.querySelectorAll('.remove').forEach((b) => {
        b.addEventListener('click', () => {
            workingTags.splice(Number(b.dataset.i), 1);
            renderWorkingTags();
        });
    });
}

function populateTagPicker() {
    els.tagPicker.innerHTML = '<option value="">Add a tag…</option>';
    allTags.forEach((tag) => {
        if (workingTags.includes(tag.name)) return;
        const opt = document.createElement('option');
        opt.value = tag.name;
        opt.textContent = capitalizeWords(tag.name);
        els.tagPicker.appendChild(opt);
    });
}

async function saveDish() {
    const name = els.dishName.value.trim();
    if (!name) {
        toast('Dish name is required', 'error');
        return;
    }
    const payload = {
        name,
        ingredients: workingIngredients,
        tags: workingTags.map((t) => t.toLowerCase()),
    };
    els.saveDishBtn.disabled = true;
    try {
        if (editingDish) {
            await api.put(`/api/dishes/${editingDish.id}`, payload);
            toast('Dish updated', 'success');
        } else {
            await api.post('/api/dishes', payload);
            toast('Dish added', 'success');
        }
        closeModal(els.dishModal);
        await loadAll();
    } catch (e) {
        toast(e.message || 'Could not save dish', 'error');
    } finally {
        els.saveDishBtn.disabled = false;
    }
}

async function deleteDish() {
    if (!editingDish) return;
    if (!confirm(`Delete "${capitalizeWords(editingDish.name)}"? This will also remove it from any planned meals.`)) return;
    try {
        await api.del(`/api/dishes/${editingDish.id}`);
        toast('Dish deleted', 'info');
        closeModal(els.dishModal);
        await loadAll();
    } catch (e) {
        toast(e.message || 'Could not delete dish', 'error');
    }
}

function renderExistingTags() {
    els.existingTagsList.innerHTML = '';
    if (allTags.length === 0) {
        const li = document.createElement('li');
        li.style.background = 'transparent';
        li.style.border = '0';
        li.style.color = 'var(--text-muted)';
        li.textContent = 'No tags yet — add some above';
        els.existingTagsList.appendChild(li);
        return;
    }
    allTags.forEach((t) => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fas fa-tag" style="font-size:0.7rem;"></i> ${escapeHtml(capitalizeWords(t.name))} <button class="remove" data-id="${t.id}" aria-label="Delete tag">&times;</button>`;
        els.existingTagsList.appendChild(li);
    });
    els.existingTagsList.querySelectorAll('.remove').forEach((b) => {
        b.addEventListener('click', async () => {
            if (!confirm('Delete this tag? It will be removed from the available tag list (already-tagged dishes keep their tag text).')) return;
            try {
                await api.del(`/api/tags/${b.dataset.id}`);
                toast('Tag deleted', 'info');
                await loadAll();
                renderExistingTags();
            } catch (e) {
                toast(e.message || 'Could not delete tag', 'error');
            }
        });
    });
}

async function saveNewTag() {
    const name = els.newTagName.value.trim().toLowerCase();
    if (!name) return toast('Tag name required', 'error');
    if (allTags.find((t) => t.name === name)) return toast('Tag already exists', 'info');
    try {
        await api.post('/api/tags', { name });
        els.newTagName.value = '';
        await loadAll();
        renderExistingTags();
        toast('Tag added', 'success');
    } catch (e) {
        toast(e.message || 'Could not add tag', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireUser();
    if (!user) return;

    renderHeader({ title: 'Dish Library', icon: 'fa-book', user });
    renderBottomNav('dishes');

    els.dishList = document.getElementById('dishList');
    els.tagFilter = document.getElementById('tagFilterRow');
    els.dishModal = document.getElementById('dishModal');
    els.dishModalTitle = document.getElementById('dishModalTitle');
    els.dishName = document.getElementById('dishName');
    els.ingList = document.getElementById('ingredientList');
    els.ingName = document.getElementById('ingName');
    els.ingQty = document.getElementById('ingQty');
    els.dishTagList = document.getElementById('dishTagList');
    els.tagPicker = document.getElementById('tagPicker');
    els.saveDishBtn = document.getElementById('saveDishBtn');
    els.deleteDishBtn = document.getElementById('deleteDishBtn');
    els.tagModal = document.getElementById('tagModal');
    els.newTagName = document.getElementById('newTagName');
    els.existingTagsList = document.getElementById('existingTagsList');

    bindModalDismiss(els.dishModal, document.getElementById('closeDishModal'), document.getElementById('cancelDishBtn'));
    bindModalDismiss(els.tagModal, document.getElementById('closeTagModal'));

    document.getElementById('addDishBtn').addEventListener('click', () => openDishModal(null));
    document.getElementById('manageTagsBtn').addEventListener('click', () => {
        renderExistingTags();
        openModal(els.tagModal);
        setTimeout(() => els.newTagName.focus(), 80);
    });
    document.getElementById('saveTagBtn').addEventListener('click', saveNewTag);
    els.newTagName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveNewTag(); }
    });

    document.getElementById('addIngBtn').addEventListener('click', addIngredient);
    [els.ingName, els.ingQty].forEach((inp) => inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addIngredient(); }
    }));
    els.tagPicker.addEventListener('change', () => {
        const v = els.tagPicker.value;
        if (v && !workingTags.includes(v)) {
            workingTags.push(v);
            renderWorkingTags();
            populateTagPicker();
        }
        els.tagPicker.value = '';
    });
    els.saveDishBtn.addEventListener('click', saveDish);
    els.deleteDishBtn.addEventListener('click', deleteDish);

    document.getElementById('dishSearch').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderDishes();
    });

    await loadAll();
});
