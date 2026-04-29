// dishes.js

const API_URL = '/api';

// --- DOM Elements ---
const dishListContainer = document.getElementById('dishListContainer');
const addDishModal = document.getElementById('addDishModal');
const closeAddModalButton = document.getElementById('closeAddModal');
const newDishNameInput = document.getElementById('newDishName');
const newDishIngredientNameInput = document.getElementById('newDishIngredientName');
const newDishIngredientQuantityInput = document.getElementById('newDishIngredientQuantity');
const addIngredientButton = document.getElementById('addIngredientButton');
const ingredientsList = document.getElementById('ingredientsList');
const addDishButton = document.getElementById('addDishButton');

const editDishModal = document.getElementById('editDishModal');
const closeEditModalButton = document.getElementById('closeEditModal');
const editDishNameInput = document.getElementById('editDishName');
const editIngredientsList = document.getElementById('editIngredientsList');
const editNewIngredientNameInput = document.getElementById('editNewIngredientName');
const editNewIngredientQuantityInput = document.getElementById('editNewIngredientQuantity');
const editAddIngredientButton = document.getElementById('editAddIngredientButton');
const saveEditedDishButton = document.getElementById('saveEditedDishButton');
const currentDishIdInput = document.getElementById('currentDishId');

const availableTagsAddDish = document.getElementById('availableTags');
const availableTagsEditDish = document.getElementById('editAvailableTags');
const selectedTagsList = document.getElementById('selectedTagsList');
const editSelectedTagsList = document.getElementById('editSelectedTagsList');

const openFilterPopupButton = document.getElementById('openFilterPopup');
const filterPopup = document.getElementById('filterPopup');
const tagButtonsContainer = document.getElementById('tagButtonsContainer');
const closeFilterPopupButton = document.getElementById('closeFilterPopup');
const clearFilterButton = document.getElementById('clearFilter');

const openAddTagPopupButton = document.getElementById('openAddTagPopup');
const addTagPopup = document.getElementById('addTagPopup');
const closeAddTagModalButton = document.getElementById('closeAddTagModal');
const newTagNameInput = document.getElementById('newTagName');
const saveNewTagButton = document.getElementById('saveNewTagButton');
const existingTagsList = document.getElementById('existingTagsList');

const openAddDishModalButton = document.getElementById('openAddDishModal');
const addDishWithIngredientsButton = document.getElementById('addDishWithIngredientsButton');


// --- State Variables ---
let currentIngredients = [];
let editingIngredients = {};
let currentTags = [];
let editingTags = [];
let currentFilterTag = '';
let allLoadedDishes = [];
let currentlyEditingIngredientKey = null;

// --- Utility Functions ---

function capitalizeWords(str) {
    if (!str) return '';
    return str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// --- Add Dish Modal Functions ---

function resetAddDishForm() {
    newDishNameInput.value = '';
    newDishIngredientNameInput.value = '';
    newDishIngredientQuantityInput.value = '';
    ingredientsList.innerHTML = '';
    selectedTagsList.innerHTML = '';
    availableTagsAddDish.selectedIndex = 0;
    currentIngredients = [];
    currentTags = [];
}

function renderIngredientsList() {
    if (!ingredientsList) return;
    ingredientsList.innerHTML = '';
    currentIngredients.forEach((ingredient, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <div><i class="fas fa-carrot"></i> ${capitalizeWords(ingredient.name)} (${ingredient.quantity})</div>
            <div>
                <button class="remove-ingredient-button" data-index="${index}">&times;</button>
            </div>
        `;
        ingredientsList.appendChild(listItem);
    });
    ingredientsList.querySelectorAll('.remove-ingredient-button').forEach(button => {
        button.addEventListener('click', (e) => removeIngredient(parseInt(e.target.dataset.index)));
    });
}

function addIngredientToList() {
    const ingredientName = newDishIngredientNameInput.value.trim().toLowerCase();
    const ingredientQuantity = newDishIngredientQuantityInput.value.trim();
    if (ingredientName && ingredientQuantity) {
        currentIngredients.push({ name: ingredientName, quantity: ingredientQuantity });
        renderIngredientsList();
        newDishIngredientNameInput.value = '';
        newDishIngredientQuantityInput.value = '';
        newDishIngredientNameInput.focus();
    } else {
        alert('Please enter both ingredient name and quantity.');
    }
}

function removeIngredient(index) {
    currentIngredients.splice(index, 1);
    renderIngredientsList();
}

function renderSelectedTags() {
    selectedTagsList.innerHTML = '';
    currentTags.forEach((tag, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span><i class="fas fa-tag"></i> ${capitalizeWords(tag)}</span>
            <button class="remove-tag-button" data-index="${index}"><i class="fas fa-times"></i></button>
        `;
        selectedTagsList.appendChild(listItem);
    });
    selectedTagsList.querySelectorAll('.remove-tag-button').forEach(button => {
        button.addEventListener('click', (e) => removeTag(parseInt(e.currentTarget.dataset.index)));
    });
}

function addTagToList() {
    const selectedTag = availableTagsAddDish.value;
    if (selectedTag && !currentTags.includes(selectedTag)) {
        currentTags.push(selectedTag);
        renderSelectedTags();
    }
    availableTagsAddDish.value = '';
}

function removeTag(index) {
    currentTags.splice(index, 1);
    renderSelectedTags();
}

function openAddDishModalHandler() {
    resetAddDishForm();
    populateTagDropdowns();
    addDishModal.style.display = 'block';
}

function closeAddDishModalHandler() {
    addDishModal.style.display = 'none';
}

// --- Edit Dish Modal Functions ---

function clearEditDishForm() {
    editDishNameInput.value = '';
    editIngredientsList.innerHTML = '';
    editSelectedTagsList.innerHTML = '';
    editNewIngredientNameInput.value = '';
    editNewIngredientQuantityInput.value = '';
    availableTagsEditDish.selectedIndex = 0;
    currentDishIdInput.value = '';
    editingIngredients = {};
    editingTags = [];
    currentlyEditingIngredientKey = null;
}

function renderEditIngredientsList() {
    editIngredientsList.innerHTML = '';
    Object.entries(editingIngredients).forEach(([ingredientId, ingredient]) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <div><i class="fas fa-caret-right"></i> ${capitalizeWords(ingredient.name)} (${ingredient.quantity})</div>
            <div>
                <button class="edit-ingredient-button" data-id="${ingredientId}"><i class="fas fa-pencil-alt"></i></button>
                <button class="remove-ingredient-button" data-id="${ingredientId}">&times;</button>
            </div>
        `;
        editIngredientsList.appendChild(listItem);
    });

    editIngredientsList.querySelectorAll('.edit-ingredient-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            handleEditIngredient(id, editingIngredients[id].name, editingIngredients[id].quantity);
        });
    });
    editIngredientsList.querySelectorAll('.remove-ingredient-button').forEach(button => {
        button.addEventListener('click', (e) => removeEditIngredient(e.currentTarget.dataset.id));
    });
}

function handleEditIngredient(ingredientId, name, quantity) {
    editNewIngredientNameInput.value = name;
    editNewIngredientQuantityInput.value = quantity;
    currentlyEditingIngredientKey = ingredientId;
    editNewIngredientNameInput.focus();
}

function addOrUpdateEditIngredient() {
    const ingredientName = editNewIngredientNameInput.value.trim().toLowerCase();
    const ingredientQuantity = editNewIngredientQuantityInput.value.trim();

    if (ingredientName && ingredientQuantity) {
        if (currentlyEditingIngredientKey) {
            editingIngredients[currentlyEditingIngredientKey].name = ingredientName;
            editingIngredients[currentlyEditingIngredientKey].quantity = ingredientQuantity;
        } else {
            const newId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            editingIngredients[newId] = { name: ingredientName, quantity: ingredientQuantity, haveIt: false };
        }
        renderEditIngredientsList();
        editNewIngredientNameInput.value = '';
        editNewIngredientQuantityInput.value = '';
        currentlyEditingIngredientKey = null;
        editNewIngredientNameInput.focus();
    }
}

function removeEditIngredient(ingredientId) {
    delete editingIngredients[ingredientId];
    renderEditIngredientsList();
    if (currentlyEditingIngredientKey === ingredientId) {
        editNewIngredientNameInput.value = '';
        editNewIngredientQuantityInput.value = '';
        currentlyEditingIngredientKey = null;
    }
}

function renderEditSelectedTags() {
    editSelectedTagsList.innerHTML = '';
    editingTags.forEach((tag, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span><i class="fas fa-tag"></i> ${capitalizeWords(tag)}</span>
            <button class="remove-tag-button" data-index="${index}"><i class="fas fa-times"></i></button>
        `;
        editSelectedTagsList.appendChild(listItem);
    });

    editSelectedTagsList.querySelectorAll('.remove-tag-button').forEach(button => {
        button.addEventListener('click', (e) => removeEditTag(parseInt(e.currentTarget.dataset.index)));
    });
}

function addEditTagToList() {
    const selectedTag = availableTagsEditDish.value;
    if (selectedTag && !editingTags.includes(selectedTag)) {
        editingTags.push(selectedTag);
        renderEditSelectedTags();
    }
    availableTagsEditDish.value = '';
}

function removeEditTag(index) {
    editingTags.splice(index, 1);
    renderEditSelectedTags();
}

function openEditModalHandler(dishId, dishName, ingredients, tags) {
    clearEditDishForm();
    populateTagDropdowns();

    editDishNameInput.value = dishName;
    currentDishIdInput.value = dishId;

    editingIngredients = JSON.parse(JSON.stringify(ingredients || {}));
    editingTags = Array.isArray(tags) ? [...tags] : [];

    renderEditIngredientsList();
    renderEditSelectedTags();

    editDishModal.style.display = 'block';
}

function closeEditModalHandler() {
    editDishModal.style.display = 'none';
}

// --- Tag Management Functions ---

async function loadTagsFromAPI() {
    try {
        const response = await fetch(`${API_URL}/tags`);
        if (!response.ok) throw new Error('Failed to fetch tags');
        const tags = await response.json();
        // Sort
        tags.sort((a, b) => a.name.localeCompare(b.name));
        return tags;
    } catch (error) {
        console.error("Error loading tags:", error);
        return [];
    }
}

async function populateTagDropdowns() {
    const tags = await loadTagsFromAPI();
    const optionsHtml = tags.map(tag =>
        `<option value="${tag.name}">${capitalizeWords(tag.name)}</option>`
    ).join('');

    if (availableTagsAddDish) {
        availableTagsAddDish.innerHTML = '<option value="" disabled selected>Add a tag...</option>' + optionsHtml;
    }
    if (availableTagsEditDish) {
        availableTagsEditDish.innerHTML = '<option value="" disabled selected>Add a tag...</option>' + optionsHtml;
    }
}

async function populateFilterTagButtons() {
    const tags = await loadTagsFromAPI();
    if (tagButtonsContainer) {
        tagButtonsContainer.innerHTML = '';

        const allButton = document.createElement('button');
        allButton.textContent = 'All';
        allButton.classList.add('tag-button');
        allButton.addEventListener('click', () => applyFilterTag(''));
        tagButtonsContainer.appendChild(allButton);

        tags.forEach(tag => {
            const button = document.createElement('button');
            button.textContent = capitalizeWords(tag.name);
            button.classList.add('tag-button');
            button.dataset.tag = tag.name;
            button.addEventListener('click', () => applyFilterTag(tag.name));
            tagButtonsContainer.appendChild(button);
        });
    }
}

async function loadAndDisplayTagsForManagement() {
    try {
        const tags = await loadTagsFromAPI();
        renderExistingTags(tags);
    } catch (error) {
        console.error("Error loading tags for management:", error);
    }
}

function renderExistingTags(tags) {
    existingTagsList.innerHTML = '';
    tags.forEach(tag => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span><i class="fas fa-tag"></i> ${capitalizeWords(tag.name)}</span>
            <button class="delete-tag-button" data-id="${tag.id}"><i class="fas fa-times"></i></button>
        `;
        existingTagsList.appendChild(listItem);
    });

    existingTagsList.querySelectorAll('.delete-tag-button').forEach(button => {
        button.addEventListener('click', (e) => deleteTagFromAPI(e.currentTarget.dataset.id));
    });
}

async function saveTagToAPI() {
    const newTagName = newTagNameInput.value.trim().toLowerCase();
    if (newTagName) {
        try {
            const existingTags = await loadTagsFromAPI();
            if (existingTags.some(tag => tag.name === newTagName)) {
                alert(`Tag "${capitalizeWords(newTagName)}" already exists.`);
                newTagNameInput.value = '';
                return;
            }

            const response = await fetch(`${API_URL}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName })
            });
            if (!response.ok) throw new Error('Failed to save tag');

            console.log("Tag added:", newTagName);
            newTagNameInput.value = '';
            await loadAndDisplayTagsForManagement();
            await populateFilterTagButtons();
            await populateTagDropdowns();
        } catch (error) {
            console.error("Error adding tag:", error);
            alert("Failed to add tag.");
        }
    } else {
        alert("Tag name cannot be empty.");
    }
}

async function deleteTagFromAPI(tagId) {
    if (!confirm('Are you sure you want to delete this tag? This cannot be undone.')) {
        return;
    }
    try {
        const response = await fetch(`${API_URL}/tags/${tagId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete tag');

        console.log("Tag deleted:", tagId);
        await loadAndDisplayTagsForManagement();
        await populateFilterTagButtons();
        await populateTagDropdowns();
    } catch (error) {
        console.error("Error deleting tag:", error);
        alert("Failed to delete tag.");
    }
}

function openAddTagModalHandler() {
    addTagPopup.style.display = 'block';
    loadAndDisplayTagsForManagement();
    newTagNameInput.focus();
}

function closeAddTagModalHandler() {
    addTagPopup.style.display = 'none';
    newTagNameInput.value = '';
    existingTagsList.innerHTML = '';
}

// --- Dish Data Loading and Rendering ---

function renderDishes(dishesToRender) {
    if (!dishListContainer) return;
    dishListContainer.innerHTML = '';

    if (dishesToRender.length === 0) {
        dishListContainer.innerHTML = '<p>No dishes found.</p>';
        return;
    }

    dishesToRender.sort((a, b) => a.name.localeCompare(b.name));

    dishesToRender.forEach(dish => {
        const dishDiv = document.createElement('div');
        dishDiv.classList.add('dish-item');
        dishDiv.setAttribute('role', 'button');
        dishDiv.setAttribute('tabindex', '0');

        let displayTags = [];
        if (Array.isArray(dish.tags)) {
            displayTags = dish.tags
                .filter(tag => tag)
                .map(tag => capitalizeWords(tag));
        }

        const tagsHtml = displayTags.length > 0
            ? `<p class="tags"><i class="fas fa-tags"></i> ${displayTags.join(', ')}</p>`
            : '';

        dishDiv.innerHTML = `
            <h3>${capitalizeWords(dish.name)}</h3>
            ${tagsHtml}
        `;

        const clickHandler = () => openEditModalHandler(dish.id, dish.name, dish.ingredients, dish.tags);
        dishDiv.addEventListener('click', clickHandler);
        dishDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                clickHandler();
            }
        });

        dishListContainer.appendChild(dishDiv);
    });
}

function filterAndRenderDishes() {
    let filteredDishes = [];
    if (!currentFilterTag) {
        filteredDishes = allLoadedDishes;
    } else {
        const lowerCaseFilter = currentFilterTag.toLowerCase();
        filteredDishes = allLoadedDishes.filter(dish =>
            Array.isArray(dish.tags) && dish.tags.some(tag => tag.toLowerCase() === lowerCaseFilter)
        );
    }
    renderDishes(filteredDishes);
}

function applyFilterTag(tag) {
    currentFilterTag = tag;
    if (tagButtonsContainer) {
        tagButtonsContainer.querySelectorAll('.tag-button').forEach(btn => {
            const buttonTag = btn.dataset.tag || '';
            if (buttonTag === currentFilterTag) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    filterAndRenderDishes();
    filterPopup.style.display = 'none';
}

// --- API Interactions (Dishes) ---

async function fetchDishesFromAPI() {
    console.log("Fetching latest dishes from API...");
    if (!dishListContainer) return;

    try {
        const response = await fetch(`${API_URL}/dishes`);
        if (!response.ok) throw new Error('Failed to fetch dishes');

        allLoadedDishes = await response.json();

        // Ensure data structure integrity
        allLoadedDishes = allLoadedDishes.map(dish => ({
            ...dish,
            ingredients: dish.ingredients || {},
            tags: dish.tags || []
        }));

        console.log("API fetch complete. Dishes loaded:", allLoadedDishes.length);

        filterAndRenderDishes();
        await populateFilterTagButtons();

    } catch (error) {
        console.error("Error loading dishes from API:", error);
        if (dishListContainer) {
            dishListContainer.innerHTML = '<p class="error-message">Could not load dishes. Please try again later.</p>';
        }
    }
}

async function saveDishToAPI() {
    const dishName = newDishNameInput.value.trim();
    if (!dishName) {
        alert('Dish name cannot be empty.');
        return;
    }

    addDishButton.disabled = true;
    addDishButton.textContent = 'Saving...';

    // Simplify structure: Ingredients will be stored as an object or array in the dish object itself
    // For consistency with edit logic: use object where key is ID. But simplify to simple list?
    // Let's stick to the current structure: ingredients is an object where keys are IDs.
    // Since we are creating clean, let's auto-generate IDs for ingredients.
    const ingredientsObj = {};
    currentIngredients.forEach(ing => {
        const id = `ing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        ingredientsObj[id] = {
            name: ing.name.toLowerCase().trim(),
            quantity: ing.quantity,
            haveIt: false
        };
    });

    const dishData = {
        name: dishName,
        tags: currentTags.map(tag => tag.toLowerCase()),
        ingredients: ingredientsObj
    };

    try {
        const response = await fetch(`${API_URL}/dishes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dishData)
        });
        if (!response.ok) throw new Error('Failed to save dish');

        console.log("Dish added successfully");
        closeAddDishModalHandler();
        await fetchDishesFromAPI();

    } catch (error) {
        console.error("Error adding dish:", error);
        alert('Failed to add dish. Please check your connection and try again.');
    } finally {
        addDishButton.disabled = false;
        addDishButton.textContent = 'Save Dish';
    }
}

async function saveEditedDish() {
    const dishId = currentDishIdInput.value;
    const updatedDishName = editDishNameInput.value.trim();

    if (!dishId || !updatedDishName) {
        alert('Dish ID is missing or dish name cannot be empty.');
        return;
    }

    saveEditedDishButton.disabled = true;
    saveEditedDishButton.textContent = 'Saving...';

    const updatedDishData = {
        name: updatedDishName,
        tags: editingTags.map(tag => tag.toLowerCase()),
        ingredients: editingIngredients // This is already the object with updated details
    };

    try {
        const response = await fetch(`${API_URL}/dishes/${dishId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedDishData)
        });
        if (!response.ok) throw new Error('Failed to update dish');

        console.log("Dish updated:", dishId);
        closeEditModalHandler();
        await fetchDishesFromAPI();

    } catch (error) {
        console.error("Error updating dish:", error);
        alert('Failed to update dish. Please check your connection and try again.');
    } finally {
        saveEditedDishButton.disabled = false;
        saveEditedDishButton.textContent = 'Save Changes';
    }
}

async function deleteDish(dishId) {
    if (!dishId) {
        console.error("deleteDish called with invalid dishId");
        alert("Error: Dish ID is missing.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/dishes/${dishId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete dish');

        console.log(`Dish deleted: ${dishId}`);
        // Optional: Trigger backend to cleanup meals using this dish, or handle locally?
        // Current API `DELETE /meals/:date` is by date. We don't have a "delete by dish ID" call for meals yet.
        // For now, meals might reference a deleted dish. We should probably update server.js to handle granular deletions if needed.
        // Or simpler: Leave as is, user will resolve manually if they see a blank entry.

        await fetchDishesFromAPI();

        const editDishModal = document.getElementById('editDishModal');
        if (editDishModal) editDishModal.style.display = 'none';

    } catch (error) {
        console.error("Error deleting dish:", error);
        alert("An error occurred while deleting the dish. Please try again.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const deleteEditedDishButton = document.getElementById('deleteEditedDishButton');

    if (deleteEditedDishButton) {
        deleteEditedDishButton.addEventListener('click', async () => {
            const dishId = document.getElementById('currentDishId')?.value;
            if (dishId) {
                if (confirm('Are you sure you want to delete this dish and all associated history?')) {
                    await deleteDish(dishId);
                }
            } else {
                console.error("Dish ID not found in modal.");
            }
        });
    }
});


// --- Initialization ---

function initializeAppAndListeners() {
    console.log("Initializing App...");

    // Initial Data Load
    fetchDishesFromAPI();

    // Event Listeners for UI
    if (openAddDishModalButton) openAddDishModalButton.addEventListener('click', openAddDishModalHandler);
    if (closeAddModalButton) closeAddModalButton.addEventListener('click', closeAddDishModalHandler);
    if (closeEditModalButton) closeEditModalButton.addEventListener('click', closeEditModalHandler);
    if (addDishButton) addDishButton.addEventListener('click', saveDishToAPI);
    if (addDishWithIngredientsButton) addDishWithIngredientsButton.addEventListener('click', addIngredientToList);

    if (newDishIngredientQuantityInput) {
        newDishIngredientQuantityInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addIngredientToList();
            }
        });
    }
    if (availableTagsAddDish) availableTagsAddDish.addEventListener('change', addTagToList);

    if (saveEditedDishButton) saveEditedDishButton.addEventListener('click', saveEditedDish);
    if (editAddIngredientButton) editAddIngredientButton.addEventListener('click', addOrUpdateEditIngredient);

    if (editNewIngredientQuantityInput) {
        editNewIngredientQuantityInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addOrUpdateEditIngredient();
            }
        });
    }
    if (availableTagsEditDish) availableTagsEditDish.addEventListener('change', addEditTagToList);

    if (openFilterPopupButton) {
        openFilterPopupButton.addEventListener('click', (event) => {
            event.stopPropagation();
            filterPopup.style.display = filterPopup.style.display === 'flex' ? 'none' : 'flex';
            if (filterPopup.style.display === 'flex') {
                populateFilterTagButtons();
            }
        });
    }
    if (closeFilterPopupButton) {
        closeFilterPopupButton.addEventListener('click', () => {
            filterPopup.style.display = 'none';
        });
    }
    if (clearFilterButton) clearFilterButton.addEventListener('click', () => applyFilterTag(''));

    if (openAddTagPopupButton) openAddTagPopupButton.addEventListener('click', openAddTagModalHandler);
    if (closeAddTagModalButton) closeAddTagModalButton.addEventListener('click', closeAddTagModalHandler);
    if (saveNewTagButton) saveNewTagButton.addEventListener('click', saveTagToAPI);
    if (newTagNameInput) {
        newTagNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTagToAPI();
            }
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === addDishModal) closeAddDishModalHandler();
        if (event.target === editDishModal) closeEditModalHandler();
        if (event.target === addTagPopup) closeAddTagModalHandler();
        if (filterPopup.style.display === 'flex' && !filterPopup.contains(event.target) && event.target !== openFilterPopupButton) {
            filterPopup.style.display = 'none';
        }
    });

}

// --- Start ---
initializeAppAndListeners();