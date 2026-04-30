const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_KEY =
    process.env.SESSION_SECRET ||
    (() => {
        const keyPath = path.join(DATA_DIR, '.session-key');
        try {
            if (fssync.existsSync(keyPath)) {
                return fssync.readFileSync(keyPath, 'utf8');
            }
        } catch {}
        const k = crypto.randomBytes(32).toString('hex');
        try {
            fssync.mkdirSync(DATA_DIR, { recursive: true });
            fssync.writeFileSync(keyPath, k, { mode: 0o600 });
        } catch (e) {
            console.warn('Could not persist session key, sessions will reset on restart:', e.message);
        }
        return k;
    })();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Security headers — same-origin only (no third-party CDN, no embedding,
// no MIME sniff, HSTS in production behind a TLS-terminating proxy).
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "img-src 'self' data:",
            // FontAwesome CSS lives on cdnjs; inline styles are sprinkled in
            // a few places so we keep 'unsafe-inline' for now.
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "font-src 'self' data: https://cdnjs.cloudflare.com",
            "script-src 'self'",
            "connect-src 'self'",
            "manifest-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; ')
    );
    if (IS_PROD) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(
    cookieSession({
        name: 'mfsession',
        keys: [SESSION_KEY],
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
        sameSite: 'lax',
        httpOnly: true,
        // Cookie is only ever sent to our own origin via NPM (TLS-terminating
        // reverse proxy). `trust proxy` lets express see the original protocol.
        secure: IS_PROD,
    })
);

// ─── Lightweight in-memory rate limiter ─────────────────────────────────────
// Per-IP token bucket. Plenty for a single-tenant family app behind NPM.
function makeRateLimiter({ windowMs, max, message = 'Too many requests' }) {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, rec] of hits) if (now - rec.start > windowMs) hits.delete(ip);
    }, windowMs).unref?.();
    return (req, res, next) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const now = Date.now();
        const rec = hits.get(ip);
        if (!rec || now - rec.start > windowMs) {
            hits.set(ip, { start: now, count: 1 });
            return next();
        }
        rec.count += 1;
        if (rec.count > max) {
            res.setHeader('Retry-After', Math.ceil((rec.start + windowMs - now) / 1000));
            return res.status(429).json({ error: message });
        }
        next();
    };
}

const authLimiter = makeRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many sign-in attempts. Try again in a few minutes.',
});

// ─── DB Helpers ──────────────────────────────────────────────────────────────

const EMPTY_FAMILY_DATA = () => ({ meals: {}, dishes: [], tags: [] });

const EMPTY_DB = () => ({
    version: 2,
    users: [],
    families: [],
    familyData: {},
});

let writeQueue = Promise.resolve();

// Single-writer mutex: serializes any read-modify-write sequence so concurrent
// requests can't clobber one another (e.g. two members leaving a family at once,
// or two clients editing the same dish). All routes that *mutate* data should
// go through `mutate(fn)` instead of readDB+writeDB directly.
let mutateChain = Promise.resolve();
function mutate(fn) {
    const next = mutateChain.catch(() => {}).then(async () => {
        const db = await readDB();
        const result = await fn(db);
        await writeDB(db);
        return result;
    });
    mutateChain = next.catch(() => {});
    return next;
}

async function initDB() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    let db;
    try {
        const raw = await fs.readFile(DB_FILE, 'utf8');
        db = JSON.parse(raw);
    } catch {
        db = EMPTY_DB();
        await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
        return;
    }

    // Migrate legacy v1 (flat meals/dishes/tags) to v2
    if (!db.version || db.version < 2) {
        const legacyMeals = db.meals || {};
        const legacyDishes = db.dishes || [];
        const legacyTags = db.tags || [];
        const familyId = 'family-legacy';
        const family = {
            id: familyId,
            name: 'My Family',
            inviteCode: generateInviteCode(),
            createdAt: new Date().toISOString(),
            ownerId: null,
        };
        const migrated = EMPTY_DB();
        migrated.families = [family];
        migrated.familyData[familyId] = {
            meals: legacyMeals,
            dishes: legacyDishes,
            tags: legacyTags,
        };
        await fs.writeFile(DB_FILE, JSON.stringify(migrated, null, 2));
        console.log('[migration] Legacy v1 data migrated into family:', familyId);
    }
}

async function readDB() {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(raw);
}

function writeDB(data) {
    const next = writeQueue.catch(() => {}).then(async () => {
        const tmp = DB_FILE + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(data, null, 2));
        await fs.rename(tmp, DB_FILE);
    });
    writeQueue = next.catch((err) => {
        console.error('[db] write failed:', err);
    });
    return next;
}

function generateId(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function generateInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return code;
}

function ensureFamilyData(db, familyId) {
    if (!db.familyData[familyId]) {
        db.familyData[familyId] = EMPTY_FAMILY_DATA();
    }
    return db.familyData[familyId];
}

function publicUser(u) {
    if (!u) return null;
    return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        familyId: u.familyId,
        createdAt: u.createdAt,
    };
}

function publicFamily(f, members = []) {
    if (!f) return null;
    return {
        id: f.id,
        name: f.name,
        inviteCode: f.inviteCode,
        createdAt: f.createdAt,
        ownerId: f.ownerId,
        members: members.map(publicUser),
    };
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

async function loadUser(req, res, next) {
    if (!req.session || !req.session.userId) {
        req.user = null;
        return next();
    }
    try {
        const db = await readDB();
        const user = db.users.find((u) => u.id === req.session.userId);
        req.user = user || null;
        if (!user) req.session = null;
    } catch (e) {
        req.user = null;
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

function requireFamily(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.user.familyId) return res.status(403).json({ error: 'No family. Create or join one.' });
    next();
}

app.use(loadUser);

// ─── Auth Routes ─────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, password, displayName, familyAction, familyName, inviteCode } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        if (username.length < 3 || username.length > 32)
            return res.status(400).json({ error: 'Username must be 3–32 characters' });
        if (!/^[a-zA-Z0-9_.-]+$/.test(username))
            return res.status(400).json({ error: 'Username may only contain letters, numbers, ., _ and -' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const db = await readDB();
        const normalized = username.toLowerCase();
        if (db.users.some((u) => u.username.toLowerCase() === normalized))
            return res.status(409).json({ error: 'Username already taken' });

        // Resolve family
        let familyId = null;
        let familyToCreate = null;
        if (familyAction === 'join') {
            const code = (inviteCode || '').trim().toUpperCase();
            if (!code) return res.status(400).json({ error: 'Invite code required to join a family' });
            const family = db.families.find((f) => (f.inviteCode || '').toUpperCase() === code);
            if (!family) return res.status(404).json({ error: 'No family found with that invite code' });
            familyId = family.id;
        } else if (familyAction === 'create' || !familyAction) {
            const name = (familyName || `${displayName || username}'s Family`).trim().slice(0, 64);
            familyToCreate = {
                id: generateId('fam'),
                name: name || 'My Family',
                inviteCode: generateInviteCode(),
                createdAt: new Date().toISOString(),
                ownerId: null,
            };
            familyId = familyToCreate.id;
        } else if (familyAction === 'none') {
            familyId = null;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = {
            id: generateId('usr'),
            username: normalized,
            passwordHash,
            displayName: ((typeof displayName === 'string' && displayName.trim()) || username).slice(0, 64),
            familyId,
            createdAt: new Date().toISOString(),
        };
        if (familyToCreate) {
            familyToCreate.ownerId = user.id;
            db.families.push(familyToCreate);
            ensureFamilyData(db, familyToCreate.id);
        } else if (familyId) {
            // If joining a legacy family without owner, claim it
            const f = db.families.find((x) => x.id === familyId);
            if (f && !f.ownerId) f.ownerId = user.id;
            ensureFamilyData(db, familyId);
        }
        db.users.push(user);
        await writeDB(db);

        req.session.userId = user.id;
        res.json({ user: publicUser(user) });
    } catch (error) {
        console.error('register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (typeof username !== 'string' || typeof password !== 'string')
            return res.status(400).json({ error: 'Username and password are required' });
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        const db = await readDB();
        const normalized = username.toLowerCase();
        const user = db.users.find((u) => (u.username || '').toLowerCase() === normalized);
        // Always run bcrypt to avoid leaking which usernames exist via timing.
        const hash = user ? user.passwordHash : '$2a$10$invalidsaltinvalidsaltinvalidsaltinvalidsaltinval.';
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.userId = user.id;
        res.json({ user: publicUser(user) });
    } catch (error) {
        console.error('login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    res.json({ user: publicUser(req.user) });
});

// ─── Family Routes ───────────────────────────────────────────────────────────

app.get('/api/family', requireAuth, async (req, res) => {
    const db = await readDB();
    if (!req.user.familyId) return res.json({ family: null });
    const family = db.families.find((f) => f.id === req.user.familyId);
    const members = db.users.filter((u) => u.familyId === req.user.familyId);
    res.json({ family: publicFamily(family, members) });
});

app.post('/api/family', requireAuth, async (req, res) => {
    try {
        const { name } = req.body || {};
        const db = await readDB();
        const fresh = db.users.find((u) => u.id === req.user.id);
        if (fresh.familyId) return res.status(400).json({ error: 'You already belong to a family. Leave it first.' });
        const family = {
            id: generateId('fam'),
            name: (name || `${fresh.displayName}'s Family`).trim().slice(0, 64),
            inviteCode: generateInviteCode(),
            createdAt: new Date().toISOString(),
            ownerId: fresh.id,
        };
        db.families.push(family);
        ensureFamilyData(db, family.id);
        fresh.familyId = family.id;
        await writeDB(db);
        const members = db.users.filter((u) => u.familyId === family.id);
        res.json({ family: publicFamily(family, members) });
    } catch (e) {
        console.error('create family:', e);
        res.status(500).json({ error: 'Could not create family' });
    }
});

app.post('/api/family/join', requireAuth, async (req, res) => {
    try {
        const code = ((req.body && req.body.inviteCode) || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ error: 'Invite code required' });
        const db = await readDB();
        const family = db.families.find((f) => (f.inviteCode || '').toUpperCase() === code);
        if (!family) return res.status(404).json({ error: 'No family found with that invite code' });
        const fresh = db.users.find((u) => u.id === req.user.id);
        if (fresh.familyId === family.id) return res.json({ family: publicFamily(family) });
        if (fresh.familyId) return res.status(400).json({ error: 'Leave your current family before joining another' });
        fresh.familyId = family.id;
        if (!family.ownerId) family.ownerId = fresh.id;
        ensureFamilyData(db, family.id);
        await writeDB(db);
        const members = db.users.filter((u) => u.familyId === family.id);
        res.json({ family: publicFamily(family, members) });
    } catch (e) {
        console.error('join family:', e);
        res.status(500).json({ error: 'Could not join family' });
    }
});

app.post('/api/family/leave', requireAuth, async (req, res) => {
    try {
        await mutate((db) => {
            const fresh = db.users.find((u) => u.id === req.user.id);
            if (!fresh || !fresh.familyId) return;
            const familyId = fresh.familyId;
            const wasOwner = (() => {
                const f = db.families.find((x) => x.id === familyId);
                return f && f.ownerId === fresh.id;
            })();
            fresh.familyId = null;
            const family = db.families.find((f) => f.id === familyId);
            const remaining = db.users.filter((u) => u.familyId === familyId);
            if (family) {
                if (remaining.length === 0) {
                    db.families = db.families.filter((f) => f.id !== familyId);
                    delete db.familyData[familyId];
                } else if (wasOwner) {
                    family.ownerId = remaining[0].id;
                }
            }
        });
        res.json({ success: true });
    } catch (e) {
        console.error('leave family:', e);
        res.status(500).json({ error: 'Could not leave family' });
    }
});

app.post('/api/family/regenerate-code', requireAuth, async (req, res) => {
    try {
        const db = await readDB();
        const family = db.families.find((f) => f.id === req.user.familyId);
        if (!family) return res.status(404).json({ error: 'Family not found' });
        if (family.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the family owner can do that' });
        family.inviteCode = generateInviteCode();
        await writeDB(db);
        res.json({ inviteCode: family.inviteCode });
    } catch (e) {
        res.status(500).json({ error: 'Could not regenerate code' });
    }
});

app.put('/api/family', requireAuth, async (req, res) => {
    try {
        const { name } = req.body || {};
        const db = await readDB();
        const family = db.families.find((f) => f.id === req.user.familyId);
        if (!family) return res.status(404).json({ error: 'Family not found' });
        if (family.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the family owner can rename' });
        family.name = (name || family.name).trim().slice(0, 64) || family.name;
        await writeDB(db);
        res.json({ family: publicFamily(family) });
    } catch (e) {
        res.status(500).json({ error: 'Could not update family' });
    }
});

app.put('/api/account', requireAuth, async (req, res) => {
    try {
        const { displayName, currentPassword, newPassword } = req.body || {};
        const db = await readDB();
        const u = db.users.find((x) => x.id === req.user.id);
        if (!u) return res.status(404).json({ error: 'User not found' });
        if (typeof displayName === 'string' && displayName.trim()) {
            u.displayName = displayName.trim().slice(0, 64);
        }
        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ error: 'Current password required to change password' });
            const ok = await bcrypt.compare(currentPassword, u.passwordHash);
            if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
            if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
            u.passwordHash = await bcrypt.hash(newPassword, 10);
        }
        await writeDB(db);
        res.json({ user: publicUser(u) });
    } catch (e) {
        res.status(500).json({ error: 'Could not update account' });
    }
});

// ─── Validation helpers ──────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateKey(s) {
    if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function sanitizeIngredients(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const out = {};
    let count = 0;
    for (const [key, val] of Object.entries(input)) {
        if (count >= 200) break;
        if (typeof key !== 'string' || key.length > 64) continue;
        if (!val || typeof val !== 'object') continue;
        const name = typeof val.name === 'string' ? val.name.trim().slice(0, 80) : '';
        if (!name) continue;
        out[key] = {
            name,
            quantity: typeof val.quantity === 'string' ? val.quantity.slice(0, 32) : '',
            haveIt: !!val.haveIt,
        };
        count++;
    }
    return out;
}

function sanitizeTags(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const out = [];
    for (const t of input) {
        if (typeof t !== 'string') continue;
        const v = t.trim().toLowerCase().slice(0, 32);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= 32) break;
    }
    return out;
}

// ─── Meal Routes (family-scoped) ─────────────────────────────────────────────

app.get('/api/meals', requireFamily, async (req, res) => {
    try {
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        res.json(data.meals || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/meals', requireFamily, async (req, res) => {
    try {
        const { date, dishName } = req.body || {};
        if (!isValidDateKey(date)) return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });
        if (typeof dishName !== 'string' || !dishName.trim())
            return res.status(400).json({ error: 'Missing dishName' });
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        data.meals[date] = dishName.trim().slice(0, 120);
        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not save meal' });
    }
});

app.delete('/api/meals/:date', requireFamily, async (req, res) => {
    try {
        if (!isValidDateKey(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        if (data.meals && data.meals[req.params.date]) {
            delete data.meals[req.params.date];
            await writeDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not clear meal' });
    }
});

// ─── Dish Routes ─────────────────────────────────────────────────────────────

app.get('/api/dishes', requireFamily, async (req, res) => {
    try {
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        res.json(data.dishes || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dishes', requireFamily, async (req, res) => {
    try {
        const body = req.body || {};
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
        if (!name) return res.status(400).json({ error: 'Dish name required' });
        const dish = {
            id: generateId('dish'),
            name,
            tags: sanitizeTags(body.tags),
            ingredients: sanitizeIngredients(body.ingredients),
            createdAt: new Date().toISOString(),
        };
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        data.dishes.push(dish);
        await writeDB(db);
        res.json(dish);
    } catch (error) {
        res.status(500).json({ error: 'Could not save dish' });
    }
});

app.put('/api/dishes/:id', requireFamily, async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body || {};
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        const idx = data.dishes.findIndex((d) => d.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Dish not found' });
        const existing = data.dishes[idx];
        const updated = { ...existing };
        if (typeof body.name === 'string') {
            const name = body.name.trim().slice(0, 80);
            if (!name) return res.status(400).json({ error: 'Dish name required' });
            updated.name = name;
        }
        if ('tags' in body) updated.tags = sanitizeTags(body.tags);
        if ('ingredients' in body) updated.ingredients = sanitizeIngredients(body.ingredients);
        updated.id = existing.id;
        updated.createdAt = existing.createdAt;
        updated.updatedAt = new Date().toISOString();
        data.dishes[idx] = updated;
        await writeDB(db);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Could not update dish' });
    }
});

app.delete('/api/dishes/:id', requireFamily, async (req, res) => {
    try {
        const id = req.params.id;
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        const dish = data.dishes.find((d) => d.id === id);
        if (!dish) return res.status(404).json({ error: 'Dish not found' });
        data.dishes = data.dishes.filter((d) => d.id !== id);
        // Remove meals that pointed at this dish (by name)
        if (data.meals) {
            for (const [date, name] of Object.entries(data.meals)) {
                if (name === dish.name) delete data.meals[date];
            }
        }
        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not delete dish' });
    }
});

// ─── Tag Routes ──────────────────────────────────────────────────────────────

app.get('/api/tags', requireFamily, async (req, res) => {
    try {
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        res.json(data.tags || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tags', requireFamily, async (req, res) => {
    try {
        const body = req.body || {};
        if (typeof body.name !== 'string' || !body.name.trim())
            return res.status(400).json({ error: 'Tag name required' });
        const name = body.name.trim().toLowerCase().slice(0, 32);
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        data.tags = data.tags || [];
        let tag = data.tags.find((t) => t.name === name);
        if (!tag) {
            tag = { id: generateId('tag'), name };
            data.tags.push(tag);
            await writeDB(db);
        }
        res.json(tag);
    } catch (error) {
        res.status(500).json({ error: 'Could not save tag' });
    }
});

app.delete('/api/tags/:id', requireFamily, async (req, res) => {
    try {
        const id = req.params.id;
        const db = await readDB();
        const data = ensureFamilyData(db, req.user.familyId);
        data.tags = (data.tags || []).filter((t) => t.id !== id);
        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Static Files + Auth Gate ────────────────────────────────────────────────

const PUBLIC_PAGES = new Set(['/login', '/login.html', '/register', '/register.html']);
const PUBLIC_ASSET_RE = /\.(css|js|png|jpe?g|svg|ico|webmanifest|json|woff2?|map)$/i;

app.get(['/login', '/register'], (req, res) => {
    res.sendFile(path.join(__dirname, req.path === '/register' ? 'register.html' : 'login.html'));
});

// Auth gate for HTML pages
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    if (PUBLIC_PAGES.has(req.path)) return next();
    if (PUBLIC_ASSET_RE.test(req.path)) return next();
    // Treat anything else without an asset extension as an HTML page
    if (!req.user) {
        return res.redirect('/login');
    }
    next();
});

app.use(
    express.static(__dirname, {
        index: 'index.html',
        extensions: ['html'],
        setHeaders(res, filePath) {
            const base = path.basename(filePath);
            if (base === 'sw.js') {
                // Service worker must always be revalidated so updates roll out promptly.
                res.setHeader('Cache-Control', 'no-cache');
                return;
            }
            if (/\.html$/i.test(base)) {
                // HTML changes rarely but we want quick rollout; SW handles offline.
                res.setHeader('Cache-Control', 'no-cache');
                return;
            }
            // Versioned (?v=) JS/CSS and binary assets: cache hard. The query
            // string busts the cache when we bump versions in HTML.
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    })
);

// ─── Boot ────────────────────────────────────────────────────────────────────

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`MealFinderrz running on http://localhost:${PORT}`);
    });
});
