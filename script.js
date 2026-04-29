// Global variables
let currentDate = new Date();
let meals = {}; // In-memory cache for meals
const API_URL = '/api'; // Relative URL since served by the same server

// DOM Elements (initialized in DOMContentLoaded)
let prevMonthButton;
let nextMonthButton;
let currentMonthDisplay;
let calendarGrid;
let addMealModal;
let closeModalButton;
let modalDateDisplay;
let selectDishDropdown; // This will be the jQuery Select2 element
let groceryListButton;
let dishLibraryButton;
let randomMealButton;

// --- API Meal Functions ---

async function loadMealsFromAPI() {
    meals = {}; // Clear local cache
    try {
        const response = await fetch(`${API_URL}/meals`);
        if (!response.ok) throw new Error('Failed to fetch meals');
        meals = await response.json();
        console.log('Meals loaded from API:', meals);
        renderCalendar();
    } catch (error) {
        console.error('Error loading meals from API:', error);
    }
}

async function loadDishesAndPopulateDropdown() {
    if (!selectDishDropdown) {
        console.error("Select dish dropdown element not found.");
        return;
    }
    try {
        const response = await fetch(`${API_URL}/dishes`);
        if (!response.ok) throw new Error('Failed to fetch dishes');
        const dishes = await response.json();

        // Format data for Select2
        const select2Data = dishes.map(dish => ({
            id: dish.name, // Use dish name as ID for simplicity in calendar mapping
            text: dish.name
        }));

        // Clear existing options
        $(selectDishDropdown).empty();
        $(selectDishDropdown).append('<option value="">Select a dish</option>'); // Default placeholder
        $(selectDishDropdown).append('<option value="clear-meal">Clear Meal</option>'); // Option to clear

        // Initialize Select2 with the data
        $(selectDishDropdown).select2({
            placeholder: 'Search or select a dish',
            allowClear: true,
            dropdownParent: $('#addMealModal'),
            data: select2Data
        });

        // Attach the change event listener *once* after initialization
        $(selectDishDropdown).off('change', handleMealSelectionChange).on('change', handleMealSelectionChange);

        console.log('Dishes loaded and dropdown populated using Select2 data.');

    } catch (error) {
        console.error("Error loading dishes:", error);
    }
}

async function saveOrUpdateMealInAPI(dateKey, dishName) {
    try {
        const response = await fetch(`${API_URL}/meals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateKey, dishName: dishName })
        });
        if (!response.ok) throw new Error('Failed to save meal');

        meals[dateKey] = dishName;
        console.log(`Meal saved to API for date: ${dateKey}, dish: ${dishName}`);
    } catch (error) {
        console.error('Error saving/updating meal in API:', error);
    }
}

async function clearMealFromAPI(dateKey) {
    try {
        const response = await fetch(`${API_URL}/meals/${dateKey}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete meal');

        console.log(`Meal cleared from API for date: ${dateKey}`);
        delete meals[dateKey];
    } catch (error) {
        console.error('Error clearing meal from API:', error);
    }
}


// --- Calendar Rendering ---

function renderCalendar() {
    if (!calendarGrid || !currentMonthDisplay) {
        console.error("Calendar elements not ready for rendering.");
        return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDay = firstDayOfMonth.getDay(); // Sunday - Saturday : 0 - 6

    currentMonthDisplay.textContent = firstDayOfMonth.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long'
    });
    calendarGrid.innerHTML = ''; // Clear previous grid

    // Add empty cells for padding days
    for (let i = 0; i < startingDay; i++) {
        const emptyCell = document.createElement('div');
        calendarGrid.appendChild(emptyCell);
    }

    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day');
        dayCell.textContent = day;

        // Format dateKey consistently as YYYY-MM-DD
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const today = new Date();
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        if (isToday) {
            dayCell.classList.add('today');
        }

        // Check if a meal exists for this date in the local 'meals' cache
        if (meals[dateKey]) {
            dayCell.classList.add('has-meal');
            const mealDisplay = document.createElement('div');
            mealDisplay.classList.add('day-content');
            mealDisplay.textContent = meals[dateKey];
            dayCell.appendChild(mealDisplay);
        }

        // Add click listener to open the modal
        dayCell.addEventListener('click', () => openAddMealModal(dateKey));
        calendarGrid.appendChild(dayCell);
    }
}

// --- Modal Interaction ---

function openAddMealModal(dateKey) {
    if (!addMealModal || !modalDateDisplay || !selectDishDropdown) {
        console.error("Modal elements not found.");
        return;
    }

    modalDateDisplay.textContent = formatDateForDisplay(dateKey);
    addMealModal.dataset.selectedDate = dateKey;

    const selectDish = $(selectDishDropdown);

    // Initialize Select2 if needed (it should be initialized by loadDishesAndPopulateDropdown already)
    // Just ensuring it's ready and updating value

    // Set value based on existing meal for this date, or null if none
    const existingMeal = meals[dateKey] || null;
    selectDish.val(existingMeal).trigger('change.select2');

    addMealModal.style.display = 'flex';
    selectDish.select2('open');
}

async function handleMealSelectionChange() {
    const selectedDish = $(this).val();
    const selectedDate = addMealModal.dataset.selectedDate;

    if (!selectedDate) {
        console.error("Selected date is missing from modal data.");
        return;
    }

    console.log(`Date: ${selectedDate}, Dish selected: ${selectedDish}`);

    try {
        if (selectedDish === 'clear-meal') {
            await clearMealFromAPI(selectedDate);
        } else if (selectedDish) {
            await saveOrUpdateMealInAPI(selectedDate, selectedDish);
        } else {
            console.log("Dish selection cleared.");
        }

        renderCalendar();
        addMealModal.style.display = 'none';
        $(this).val(null).trigger('change.select2');

    } catch (error) {
        console.error("Error handling meal selection change:", error);
        alert("An error occurred while updating the meal. Please try again.");
    }
}


// --- Random Meal Selection ---

async function selectRandomMeal(event) {
    // Prevent event from bubbling up and closing modal prematurely
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // Close the Select2 dropdown first
    $(selectDishDropdown).select2('close');

    const selectedDate = addMealModal.dataset.selectedDate;
    if (!selectedDate) {
        console.error("No date selected for random meal.");
        return;
    }

    try {
        // Fetch all dishes from the API
        const response = await fetch(`${API_URL}/dishes`);
        if (!response.ok) throw new Error('Failed to fetch dishes');
        const dishes = await response.json();

        if (!dishes || dishes.length === 0) {
            alert('No saved dishes available. Please add some dishes first!');
            return;
        }

        // Pick a random dish
        const randomIndex = Math.floor(Math.random() * dishes.length);
        const randomDish = dishes[randomIndex];

        // Save the random dish to the selected date
        await saveOrUpdateMealInAPI(selectedDate, randomDish.name);

        // Refresh calendar first, then close modal
        renderCalendar();
        addMealModal.style.display = 'none';

        console.log(`Random meal selected: ${randomDish.name} for ${selectedDate}`);
    } catch (error) {
        console.error('Error selecting random meal:', error);
        alert('An error occurred while selecting a random meal. Please try again.');
    }
}

// --- Utility Functions ---

function formatDateForDisplay(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM Elements
    prevMonthButton = document.getElementById('prevMonth');
    nextMonthButton = document.getElementById('nextMonth');
    currentMonthDisplay = document.getElementById('currentMonth');
    calendarGrid = document.getElementById('calendarGrid');
    addMealModal = document.getElementById('addMealModal');
    closeModalButton = document.getElementById('closeModal');
    modalDateDisplay = document.getElementById('modalDate');
    selectDishDropdown = document.getElementById('selectDish');
    groceryListButton = document.getElementById('groceryListButton');
    dishLibraryButton = document.getElementById('dishLibraryButton');
    randomMealButton = document.getElementById('randomMealButton');

    // Load initial data
    await loadDishesAndPopulateDropdown();
    await loadMealsFromAPI();

    // Event Listeners
    if (prevMonthButton) {
        prevMonthButton.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextMonthButton) {
        nextMonthButton.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            if (addMealModal) addMealModal.style.display = 'none';
        });
    }

    if (addMealModal) {
        window.addEventListener('click', (event) => {
            if (event.target === addMealModal) {
                addMealModal.style.display = 'none';
            }
        });
    }

    if (randomMealButton) {
        randomMealButton.addEventListener('click', selectRandomMeal);
    }
});
