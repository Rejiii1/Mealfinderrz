const API_URL = '/api';

// DOM Elements
const groceryListContainer = document.getElementById('groceryList');
const clearGroceryListButton = document.getElementById('clearGroceryList');


// --- API Functions ---

async function fetchMealsFromAPI(startDate) {
    try {
        const response = await fetch(`${API_URL}/meals`);
        if (!response.ok) throw new Error('Failed to fetch meals');
        const allMeals = await response.json(); // Object { "YYYY-MM-DD": "dishName" }

        // Filter by date
        const meals = [];
        const start = new Date(startDate).getTime();

        for (const [dateStr, dishName] of Object.entries(allMeals)) {
            const mealDate = new Date(dateStr).getTime();
            if (mealDate >= start) {
                meals.push({
                    date: dateStr,
                    dishName: dishName
                });
            }
        }
        return meals;

    } catch (error) {
        console.error('Error fetching meals:', error);
        return [];
    }
}

async function fetchDishesFromAPI() {
    try {
        const response = await fetch(`${API_URL}/dishes`);
        if (!response.ok) throw new Error('Failed to fetch dishes');
        return await response.json();
    } catch (error) {
        console.error('Error fetching dishes:', error);
        return [];
    }
}

async function updateDishInAPI(dishId, updatedData) {
    try {
        const response = await fetch(`${API_URL}/dishes/${dishId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (!response.ok) throw new Error('Failed to update dish');
    } catch (error) {
        console.error(`Error updating dish ${dishId}:`, error);
    }
}

async function getDishByName(dishName, allDishes) {
    return allDishes.find(d => d.name === dishName);
}


// --- Grocery List Logic ---

function pluralizeUnit(unit, quantity) {
    if (quantity > 1 && unit) {
        if (unit.toLowerCase() === 'box') {
            return 'Boxes';
        } else if (unit.toLowerCase().endsWith('s')) {
            return unit;
        } else {
            return unit + 's';
        }
    }
    return unit;
}

let groceryListCache = []; // Store the generated grocery list

function displayGroceryList(groceryList) {
    groceryListContainer.innerHTML = '';

    if (groceryList.length === 0) {
        const noMealsMessage = document.createElement('li');
        noMealsMessage.textContent = 'No ingredients needed.';
        groceryListContainer.appendChild(noMealsMessage);
    } else {
        groceryList.forEach(item => {
            const listItem = document.createElement('li');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('grocery-item-checkbox');
            checkbox.dataset.ingredientName = item.name;
            checkbox.dataset.dishIds = JSON.stringify(item.dishIds);
            checkbox.checked = item.haveIt || false;

            checkbox.addEventListener('change', async (event) => {
                const ingredientName = event.target.dataset.ingredientName;
                const dishIds = JSON.parse(event.target.dataset.dishIds);
                const isChecked = event.target.checked;

                // Update Local Cache
                const updatedList = groceryListCache.map(cachedItem => {
                    if (cachedItem.name === ingredientName) {
                        return { ...cachedItem, haveIt: isChecked };
                    }
                    return cachedItem;
                });
                groceryListCache = updatedList;
                displayGroceryList(groceryListCache);

                // Update API (Backend)
                // We need to update the 'haveIt' status for this ingredient in ALL dishes that have it.
                // This requires fetching the specific dishes, updating the specific ingredient in their ingredients object, and saving back.
                // Optimally we'd have an API endpoint to 'toggle ingredient haveIt', but let's do it client-side logic for now.

                // Fetch all dishes first to be efficient? No, iterate dishIds.
                const allDishes = await fetchDishesFromAPI(); // Get fresh data

                for (const dishId of dishIds) {
                    const dish = allDishes.find(d => d.id === dishId);
                    if (dish && dish.ingredients) {
                        // find ingredient entry. Ingredients is an object { id: {name, ...} }
                        let modified = false;
                        for (const [key, val] of Object.entries(dish.ingredients)) {
                            if (val.name.toLowerCase() === ingredientName.toLowerCase()) {
                                dish.ingredients[key].haveIt = isChecked;
                                modified = true;
                            }
                        }
                        if (modified) {
                            await updateDishInAPI(dish.id, dish);
                        }
                    }
                }
            });

            const capitalizedIngredientName = item.name.split(' ').map(word => {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }).join(' ');

            let displayText = capitalizedIngredientName;
            let quantityAndUnit = '';
            if (item.totalQuantity > 0) {
                quantityAndUnit += ` (x ${item.totalQuantity}`;
                if (item.unit) {
                    const pluralUnit = pluralizeUnit(item.unit, item.totalQuantity);
                    quantityAndUnit += ` ${pluralUnit})`;
                } else {
                    quantityAndUnit += `)`;
                }
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = displayText + quantityAndUnit;

            listItem.appendChild(textSpan);
            listItem.appendChild(checkbox);
            groceryListContainer.appendChild(listItem);
        });
    }
}

async function generateGroceryList() {
    // Current logic: Fetch all meals from today onwards.
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDateStr = startOfToday.toISOString().split('T')[0]; // simple comparison string? No, API returns whatever cache matches. logic uses timestamps.

    try {
        const meals = await fetchMealsFromAPI(startDateStr);
        if (meals.length === 0) {
            groceryListContainer.innerHTML = '<li>No meals planned for today or later.</li>';
            return;
        }

        const allDishes = await fetchDishesFromAPI();
        const ingredientQuantities = {};

        for (const meal of meals) {
            const dish = await getDishByName(meal.dishName, allDishes);
            if (dish && dish.ingredients) {
                // Iterate over ingredients object
                Object.values(dish.ingredients).forEach(ingredient => {
                    const cleanIngredientName = ingredient.name.toLowerCase().trim();
                    const quantityWithUnit = ingredient.quantity || '';
                    const unitMatch = quantityWithUnit.match(/[a-zA-Z]+/);
                    const quantityMatch = quantityWithUnit.match(/[\d.]+/);
                    const quantity = quantityMatch ? parseFloat(quantityMatch[0]) : 1;
                    const unit = unitMatch ? unitMatch[0].trim() : '';
                    const haveIt = ingredient.haveIt || false;

                    if (ingredientQuantities[cleanIngredientName]) {
                        ingredientQuantities[cleanIngredientName].totalQuantity += quantity;
                        // Unit merging logic (kept simple)
                        if (unit && ingredientQuantities[cleanIngredientName].unit === '') {
                            ingredientQuantities[cleanIngredientName].unit = unit;
                        }
                        // Consolidate 'haveIt'. If it's true in one, is it true in all? 
                        // Logic says: if you have it for one dish, you usually have it for all unless you used it up.
                        // But UI shows a global checkbox. Let's sync it.
                        ingredientQuantities[cleanIngredientName].haveIt = ingredientQuantities[cleanIngredientName].haveIt || haveIt;

                        if (!ingredientQuantities[cleanIngredientName].dishIds.includes(dish.id)) {
                            ingredientQuantities[cleanIngredientName].dishIds.push(dish.id);
                        }
                    } else {
                        ingredientQuantities[cleanIngredientName] = {
                            name: cleanIngredientName,
                            totalQuantity: quantity,
                            unit: unit,
                            haveIt: haveIt,
                            dishIds: [dish.id]
                        };
                    }
                });
            }
        }

        const groceryList = Object.values(ingredientQuantities).sort((a, b) => a.name.localeCompare(b.name));
        groceryListCache = groceryList;
        displayGroceryList(groceryList);

    } catch (error) {
        console.error("Error generating grocery list:", error);
        groceryListContainer.innerHTML = '<li>Error loading grocery list.</li>';
    }
}

async function clearAllGroceryList() {
    if (!confirm("Reset 'Have It' status for all ingredients?")) return;

    try {
        const allDishes = await fetchDishesFromAPI();
        for (const dish of allDishes) {
            let modified = false;
            if (dish.ingredients) {
                for (const key in dish.ingredients) {
                    if (dish.ingredients[key].haveIt) {
                        dish.ingredients[key].haveIt = false;
                        modified = true;
                    }
                }
            }
            if (modified) {
                await updateDishInAPI(dish.id, dish);
            }
        }
        await generateGroceryList(); // Refresh
    } catch (error) {
        console.error("Error clearing grocery list:", error);
    }
}

// --- Initialization ---

if (clearGroceryListButton) {
    clearGroceryListButton.addEventListener('click', clearAllGroceryList);
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    generateGroceryList();
});
