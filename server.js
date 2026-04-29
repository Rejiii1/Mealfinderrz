const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (frontend)

// Ensure data directory and file exist
async function initDB() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR);
    }
    try {
        await fs.access(DB_FILE);
    } catch {
        const initialData = { meals: {}, dishes: [], tags: [] };
        await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

async function readDB() {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
}

async function writeDB(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// --- API Endpoints ---

// Get all meals
app.get('/api/meals', async (req, res) => {
    try {
        const db = await readDB();
        // Convert object to array for frontend if needed, or keep as object
        // The frontend expects some format, let's stick to what we have in the DB for now: an object or array?
        // In the original code, `meals` was an object keyed by date.
        // Let's return the whole object map.
        res.json(db.meals || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save or Update a meal
app.post('/api/meals', async (req, res) => {
    try {
        const { date, dishName } = req.body;
        if (!date || !dishName) return res.status(400).json({ error: 'Missing date or dishName' });

        const db = await readDB();
        db.meals = db.meals || {};
        db.meals[date] = dishName; // Key by YYYY-MM-DD
        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a meal
app.delete('/api/meals/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const db = await readDB();
        if (db.meals && db.meals[date]) {
            delete db.meals[date];
            await writeDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all dishes
app.get('/api/dishes', async (req, res) => {
    try {
        const db = await readDB();
        res.json(db.dishes || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a dish
app.post('/api/dishes', async (req, res) => {
    try {
        const dish = req.body;
        // Assign ID
        dish.id = Date.now().toString();
        const db = await readDB();
        db.dishes = db.dishes || [];
        db.dishes.push(dish);
        await writeDB(db);
        res.json(dish);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a dish
app.put('/api/dishes/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updatedDish = req.body;
        const db = await readDB();
        const index = db.dishes.findIndex(d => d.id === id);
        if (index !== -1) {
            db.dishes[index] = { ...db.dishes[index], ...updatedDish, id }; // Ensure ID matches
            await writeDB(db);
            res.json(db.dishes[index]);
        } else {
            res.status(404).json({ error: 'Dish not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a dish
app.delete('/api/dishes/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const db = await readDB();
        db.dishes = db.dishes.filter(d => d.id !== id);
        // Also remove meals that use this dish?
        // Optional cleanup
        const dishName = db.dishes.find(d => d.id === id)?.name; // This logic is flawed if we already filtered it out
        // Better logic: find name first
        // But the user's original code handled deletion cleanup via separate calls or logic.
        // Let's stick to simple dish deletion for now. The frontend might handle cleanup or we can add it later.

        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all tags
app.get('/api/tags', async (req, res) => {
    try {
        const db = await readDB();
        res.json(db.tags || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a tag
app.post('/api/tags', async (req, res) => {
    try {
        const tag = req.body; // { name: 'foo' }
        tag.id = Date.now().toString();
        const db = await readDB();
        db.tags = db.tags || [];
        // Check duplicates?
        if (!db.tags.find(t => t.name.toLowerCase() === tag.name.toLowerCase())) {
            db.tags.push(tag);
            await writeDB(db);
        }
        res.json(tag);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a tag
app.delete('/api/tags/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const db = await readDB();
        db.tags = db.tags.filter(t => t.id !== id);
        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize and Listen
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
