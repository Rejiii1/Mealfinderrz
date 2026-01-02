import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, Timestamp, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

        // TODO: Add SDKs for Firebase products that you want to use
        // https://firebase.google.com/docs/web/setup#available-libraries

        // Your web app's Firebase configuration
        // For Firebase JS SDK v7.20.0 and later, measurementId is optional
        const firebaseConfig = {
            apiKey: "<your_api_key>",
            authDomain: "weekly-menu-2.firebaseapp.com",
            projectId: "weekly-menu-2",
            storageBucket: "weekly-menu-2.firebasestorage.app",
            messagingSenderId: "600774461017",
            appId: "1:600774461017:web:70238ba949e473171e5348",
            measurementId: "G-5FX6NGDP97"
        };

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        
        // Global variables
        let currentDate = new Date();
        let meals = {}; // In-memory cache for meals, populated from Firestore
        let currentUserId = null; // Store the current user's ID
        
        // DOM Elements (initialized in DOMContentLoaded)
        let prevMonthButton;
        let nextMonthButton;
        let currentMonthDisplay;
        let calendarGrid;
        let dishListElement; // Main dish list display (optional, can be removed if not used)
        let addMealModal;
        let closeModalButton;
        let modalDateDisplay;
        let selectDishDropdown; // This will be the jQuery Select2 element
        let groceryListButton;
        let dishLibraryButton;
        
        // --- Firestore Meal Functions (from New Code, slightly adapted) ---
        
        /**
         * Loads meals for the logged-in user from Firestore and populates the `meals` object.
         * @param {string} userId - The ID of the currently logged-in user.
         */
        async function loadMealsFromFirestore(userId) {
            meals = {}; // Clear local cache before loading
            try {
                const mealsCollection = collection(db, 'meals');
                // Query meals belonging to the current user
                const q = query(mealsCollection, where('userId', '==', userId));
                const querySnapshot = await getDocs(q);
        
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    // Convert Firestore Timestamp to Date object, then format as YYYY-MM-DD key
                    const date = data.date.toDate();
                    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    meals[dateKey] = data.dishName;
                    // Store the Firestore document ID along with the meal for easy deletion/update
                    meals[dateKey + '_docId'] = doc.id;
                });
                console.log('Meals loaded from Firestore:', meals);
                renderCalendar(); // Re-render the calendar after loading meals
            } catch (error) {
                console.error('Error loading meals from Firestore:', error);
                // Optionally, display an error message to the user
            }
        }
       
        async function loadDishesAndPopulateDropdown() {
            if (!selectDishDropdown) {
                console.error("Select dish dropdown element not found.");
                return;
            }
            try {
                const dishesCollection = collection(db, 'dishes');
                const dishSnapshot = await getDocs(dishesCollection);
                const dishes = dishSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })); // Get ID and name

                // Format data for Select2
                const select2Data = dishes.map(dish => ({
                    id: dish.name, // Use dish name as ID (assuming names are unique)
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

     /**
 /**
 * Saves or updates a meal in Firestore for a specific date.
 * @param {firebase.firestore.Firestore} db - The Firestore database instance.
 * @param {function} docFn - The Firestore 'doc' function. // ADD THIS
 * @param {function} updateDocFn - The Firestore 'updateDoc' function. // ADD THIS
 * @param {string} userId - The user's ID.
 * @param {string} dateKey - The date in 'YYYY-MM-DD' format.
 * @param {string} dishName - The name of the dish.
 */
async function saveOrUpdateMealInFirestore(db, docFn, updateDocFn, userId, dateKey, dishName) {
    if (!userId) {
        console.error('User ID is missing. Cannot save meal.');
        return;
    }
    try {
        const mealsCollection = collection(db, 'meals');
        const [year, month, day] = dateKey.split('-').map(Number);
        const mealDate = Timestamp.fromDate(new Date(year, month - 1, day));
        const existingDocId = meals[dateKey + '_docId'];

        if (existingDocId) {
            const mealDocRef = docFn(db, 'meals', existingDocId); // Use the passed 'docFn'
            await updateDocFn(mealDocRef, { dishName: dishName }); // Use the passed 'updateDocFn'
            console.log(`Meal updated in Firestore for date: ${dateKey}, dish: ${dishName}`);
        } else {
            const newDocRef = await addDoc(mealsCollection, {
                userId: userId,
                date: mealDate,
                dishName: dishName,
            });
            console.log(`Meal saved to Firestore for date: ${dateKey}, dish: ${dishName}`);
            meals[dateKey + '_docId'] = newDocRef.id;
        }
        meals[dateKey] = dishName;

    } catch (error) {
        console.error('Error saving/updating meal in Firestore:', error);
    }
}
        

    /**
     * Clears a meal from Firestore for a specific date.
     * @param {firebase.firestore.Firestore} db - The Firestore database instance.
     * @param {string} userId - The user's ID.
     * @param {string} dateKey - The date in 'YYYY-MM-DD' format.
     */
    async function clearMealFromFirestore(db, userId, dateKey) { // Accept 'db' as an argument
        if (!userId) {
            console.error('User ID is missing. Cannot clear meal.');
            return;
        }
        try {
            const existingDocId = meals[dateKey + '_docId'];
            if (existingDocId) {
                const mealDocRef = doc(db, 'meals', existingDocId);
                await deleteDoc(mealDocRef);
                console.log(`Meal cleared from Firestore for date: ${dateKey}`);
                // Remove from local cache
                delete meals[dateKey];
                delete meals[dateKey + '_docId'];
            } else {
                console.log(`No meal found in cache/Firestore to clear for date: ${dateKey}`);
                // Optional: You could still query Firestore here as a fallback,
                // but relying on the cache (populated by loadMealsFromFirestore) is faster.
            }
        } catch (error) {
            console.error('Error clearing meal from Firestore:', error);
            // Optionally, display an error message to the user
        }
    }
        
        
        // --- Calendar Rendering (from Old Code, uses 'meals' object) ---
        
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
            // Ensure startingDay calculation is correct (0 for Sunday, 1 for Monday, etc.)
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
                dayCell.classList.add('day'); // Use your existing CSS class for styling
                dayCell.textContent = day; // Display the day number
        
                // Format dateKey consistently as YYYY-MM-DD
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
                const today = new Date();
                const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                if (isToday) {
                    dayCell.classList.add('today'); // Add a special class for today's date
                }

                // Check if a meal exists for this date in the local 'meals' cache
                if (meals[dateKey]) {
                    dayCell.classList.add('has-meal'); // Add class if meal exists
                    const mealDisplay = document.createElement('div');
                    mealDisplay.classList.add('day-content'); // Use your existing CSS class
                    mealDisplay.textContent = meals[dateKey]; // Display the meal name
                    // Ensure meal name doesn't overwrite day number; append it
                    dayCell.appendChild(mealDisplay);
                }
        
                // Add click listener to open the modal
                dayCell.addEventListener('click', () => openAddMealModal(dateKey));
                calendarGrid.appendChild(dayCell);
            }
             console.log("Calendar rendered for", currentMonthDisplay.textContent);
        }
        
        // --- Modal Interaction (Based on Old Code's structure, uses Select2, triggers Firestore functions) ---
        
        /**
         * Opens the Add Meal modal, populates the date, and initializes/opens Select2.
         * @param {string} dateKey - The selected date in 'YYYY-MM-DD' format.
         */
        function openAddMealModal(dateKey) {
            if (!addMealModal || !modalDateDisplay || !selectDishDropdown) {
                console.error("Modal elements not found.");
                return;
            }

            modalDateDisplay.textContent = formatDateForDisplay(dateKey);
            addMealModal.dataset.selectedDate = dateKey; // Store dateKey on the modal

            const selectDish = $(selectDishDropdown);

            // Initialize Select2 if it hasn't been already
            if (!selectDish.hasClass('select2-hidden-accessible')) {
                selectDish.select2({
                    placeholder: 'Search or select a dish',
                    allowClear: true,
                    dropdownParent: $('#addMealModal'),
                    data: [] // Data will be loaded on focus or when opened
                });

                // Attach the change event listener *once* during initialization
                selectDish.off('change', handleMealSelectionChange).on('change', handleMealSelectionChange);
                console.log("Select2 initialized.");
            }

            // Set value based on existing meal for this date, or null if none
            const existingMeal = meals[dateKey] || null;
            selectDish.val(existingMeal).trigger('change.select2'); // Update Select2 display without triggering our custom event

            addMealModal.style.display = 'flex'; // Show the modal

            // Programmatically open the Select2 dropdown
            selectDish.select2('open');

            console.log("Modal opened for date:", dateKey);
        }
        
        /**
         * Handles the change event from the Select2 dropdown.
         */
        async function handleMealSelectionChange() {
            if (!currentUserId) {
                console.error("User not logged in. Cannot process meal change.");
                alert("You must be logged in to manage meals.");
                return;
            }
            const selectedDish = $(this).val();
            const selectedDate = addMealModal.dataset.selectedDate;
    
            if (!selectedDate) {
                console.error("Selected date is missing from modal data.");
                return;
            }
    
            console.log(`Date: ${selectedDate}, Dish selected: ${selectedDish}`);
    
            try {
                if (selectedDish === 'clear-meal') {
                    await clearMealFromFirestore(db, currentUserId, selectedDate);
                } else if (selectedDish) {
                    await saveOrUpdateMealInFirestore(db, doc, updateDoc, currentUserId, selectedDate, selectedDish); // Pass 'doc' and 'updateDoc'
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
        
        
        // --- Utility Functions ---
        
        function formatDateForDisplay(dateKey) {
            const [year, month, day] = dateKey.split('-').map(Number);
            // Month in Date object is 0-indexed, so subtract 1
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
        
        // --- Logout Function ---
        
        window.logout = async () => {
            try {
                await signOut(auth);
                console.log('Logout successful');
                currentUserId = null; // Clear user ID
                meals = {}; // Clear meal cache
                window.location.href = 'login.html'; // Redirect to login page
            } catch (error) {
                console.error('Logout failed:', error);
            }
        };
        
        // --- Initialization and Event Listeners (DOMContentLoaded) ---
        
        document.addEventListener('DOMContentLoaded', () => {
            // Get DOM Elements
            prevMonthButton = document.getElementById('prevMonth');
            nextMonthButton = document.getElementById('nextMonth');
            currentMonthDisplay = document.getElementById('currentMonth');
            calendarGrid = document.getElementById('calendarGrid');
            dishListElement = document.getElementById('dishList'); // Optional display
            addMealModal = document.getElementById('addMealModal');
            closeModalButton = document.getElementById('closeModal'); // Ensure your close button has this ID
            modalDateDisplay = document.getElementById('modalDate');
            selectDishDropdown = document.getElementById('selectDish'); // The <select> element
            groceryListButton = document.getElementById('groceryListButton');
            dishLibraryButton = document.getElementById('dishLibraryButton');



            loadDishesAndPopulateDropdown();
            // --- Basic Event Listeners ---
            if (prevMonthButton) {
                prevMonthButton.addEventListener('click', () => {
                    currentDate.setMonth(currentDate.getMonth() - 1);
                    renderCalendar(); // Re-render calendar for the new month
                    // Consider if you need to load meals specifically for this month range
                });
            }
        
            if (nextMonthButton) {
                nextMonthButton.addEventListener('click', () => {
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    renderCalendar(); // Re-render calendar for the new month
                    // Consider if you need to load meals specifically for this month range
                });
            }
        
            if (closeModalButton) {
                closeModalButton.addEventListener('click', () => {
                    if (addMealModal) addMealModal.style.display = 'none';
                     // Optionally reset Select2 state when modal is closed manually
                     // $(selectDishDropdown).val(null).trigger('change.select2');
                });
            }
        
             // Close modal if clicked outside the content
             if (addMealModal) {
                  window.addEventListener('click', (event) => {
                    if (event.target === addMealModal) {
                        addMealModal.style.display = 'none';
                        // $(selectDishDropdown).val(null).trigger('change.select2');
                     }
                  });
             }
        
        
             if (groceryListButton) {
                groceryListButton.addEventListener('click', () => {
                  window.location.href = 'grocery.html';
                });
              }
              
              if (dishLibraryButton) {
                dishLibraryButton.addEventListener('click', () => {
                  window.location.href = 'dishes.html';
                });
              }
        
            // Authentication State Change Listener
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    // User is signed in
                    console.log('User is logged in:', user.uid);
                    currentUserId = user.uid; // Store the user ID
        
                    // Initial setup for logged-in user
                    try {
                        await loadDishesAndPopulateDropdown(); // Load dishes for the modal first
                        await loadMealsFromFirestore(currentUserId); // Load meals and then render calendar
                        // renderCalendar() is called inside loadMealsFromFirestore after data is loaded
                    } catch (error) {
                         console.error("Error during initial data load:", error);
                         // Handle error, maybe show a message to the user
                         renderCalendar(); // Render empty calendar even if data load fails
                    }
        
                } else {
                    // User is signed out
                    console.log('User is logged out.');
                    currentUserId = null;
                    meals = {}; // Clear meals cache
                    // Redirect to login page
                    if (window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') { // Avoid redirect loops
                        window.location.href = 'login.html';
                    }
                }
            });
        }); // End DOMContentLoaded
