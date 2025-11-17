const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { db, uuid } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const serializeUser = (user) => {
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
};

const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'Authentification requise' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
        if (!user) {
            return res.status(401).json({ message: 'Utilisateur introuvable' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token invalide' });
    }
};

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Champs requis manquants' });
    }
    const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (exists) {
        return res.status(400).json({ message: 'Nom d’utilisateur ou email déjà utilisé' });
    }
    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
        INSERT INTO users (username, email, password_hash, bio)
        VALUES (?, ?, ?, ?)
    `).run(username, email, password_hash, 'Nouveau membre');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user.id);
    res.json({ token, user: serializeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
    const { credential, password } = req.body;
    if (!credential || !password) {
        return res.status(400).json({ message: 'Identifiants manquants' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(credential, credential);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ message: 'Identifiants invalides' });
    }
    const token = generateToken(user.id);
    res.json({ token, user: serializeUser(user) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: serializeUser(req.user) });
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Déconnecté' });
});

// Items
app.get('/api/items', (req, res) => {
    const { search = '', category, condition, maxPrice } = req.query;
    const params = [];
    let query = `
        SELECT items.*, users.username as seller_username, users.rating as seller_rating, users.reviews_count as seller_reviews
        FROM items
        JOIN users ON users.id = items.seller_id
        WHERE 1=1
    `;
    if (search) {
        query += ` AND (
            LOWER(items.title) LIKE ? OR
            LOWER(items.description) LIKE ? OR
            LOWER(items.brand) LIKE ?
        )`;
        const term = `%${search.toLowerCase()}%`;
        params.push(term, term, term);
    }
    if (category) {
        query += ' AND items.category = ?';
        params.push(category);
    }
    if (condition) {
        query += ' AND items.condition = ?';
        params.push(condition);
    }
    if (maxPrice) {
        query += ' AND items.price <= ?';
        params.push(Number(maxPrice));
    }
    query += ' ORDER BY items.created_at DESC';
    const items = db.prepare(query).all(...params);
    res.json({ items });
});

app.get('/api/items/:id', (req, res) => {
    const item = db.prepare(`
        SELECT items.*, users.username as seller_username, users.bio as seller_bio,
               users.rating as seller_rating, users.reviews_count as seller_reviews
        FROM items
        JOIN users ON users.id = items.seller_id
        WHERE items.id = ?
    `).get(req.params.id);
    if (!item) {
        return res.status(404).json({ message: 'Article introuvable' });
    }
    const reviews = db.prepare(`
        SELECT reviewer, rating, comment, created_at
        FROM reviews
        WHERE seller_id = ?
        ORDER BY created_at DESC
    `).all(item.seller_id);
    res.json({ item, reviews });
});

app.post('/api/items', authenticate, (req, res) => {
    const { title, description, price, condition, category, size, brand, image } = req.body;
    if (!title || !description || !price || !condition || !category || !size || !brand) {
        return res.status(400).json({ message: 'Champs requis manquants' });
    }
    const imageUrl = image || 'https://via.placeholder.com/400x500/cccccc/666666?text=Nouvel+Article';
    const result = db.prepare(`
        INSERT INTO items (title, description, price, condition, category, size, brand, image_url, seller_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, price, condition, category, size, brand, imageUrl, req.user.id);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ item });
});

// Favorites
app.get('/api/favorites', authenticate, (req, res) => {
    const favorites = db.prepare(`
        SELECT items.*, users.username as seller_username
        FROM favorites
        JOIN items ON favorites.item_id = items.id
        JOIN users ON users.id = items.seller_id
        WHERE favorites.user_id = ?
    `).all(req.user.id);
    res.json({ favorites });
});

app.post('/api/items/:id/favorite', authenticate, (req, res) => {
    const itemId = Number(req.params.id);
    const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId);
    if (!exists) {
        return res.status(404).json({ message: 'Article introuvable' });
    }
    const favorite = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND item_id = ?').get(req.user.id, itemId);
    if (favorite) {
        db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').run(req.user.id, itemId);
        return res.json({ favorited: false });
    } else {
        db.prepare('INSERT INTO favorites (user_id, item_id) VALUES (?, ?)').run(req.user.id, itemId);
        return res.json({ favorited: true });
    }
});

// Cart
app.get('/api/cart', authenticate, (req, res) => {
    const items = db.prepare(`
        SELECT items.*, cart_items.added_at
        FROM cart_items
        JOIN items ON items.id = cart_items.item_id
        WHERE cart_items.user_id = ?
    `).all(req.user.id);
    res.json({ items });
});

app.post('/api/cart', authenticate, (req, res) => {
    const { itemId } = req.body;
    if (!itemId) {
        return res.status(400).json({ message: 'Article requis' });
    }
    const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId);
    if (!exists) {
        return res.status(404).json({ message: 'Article introuvable' });
    }
    db.prepare('INSERT OR IGNORE INTO cart_items (user_id, item_id) VALUES (?, ?)').run(req.user.id, itemId);
    const items = db.prepare(`
        SELECT items.*, cart_items.added_at
        FROM cart_items
        JOIN items ON items.id = cart_items.item_id
        WHERE cart_items.user_id = ?
    `).all(req.user.id);
    res.json({ items });
});

app.delete('/api/cart/:itemId', authenticate, (req, res) => {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND item_id = ?').run(req.user.id, req.params.itemId);
    const items = db.prepare(`
        SELECT items.*, cart_items.added_at
        FROM cart_items
        JOIN items ON items.id = cart_items.item_id
        WHERE cart_items.user_id = ?
    `).all(req.user.id);
    res.json({ items });
});

app.get('/api/orders', authenticate, (req, res) => {
    const rows = db.prepare(`
        SELECT o.*, oi.item_id, oi.price as item_price, i.title, i.image_url
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN items i ON i.id = oi.item_id
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
    `).all(req.user.id);

    const grouped = {};
    rows.forEach(row => {
        if (!grouped[row.id]) {
            grouped[row.id] = {
                id: row.id,
                total: row.total,
                status: row.status || 'processing',
                expected_delivery: row.expected_delivery,
                created_at: row.created_at,
                items: []
            };
        }
        grouped[row.id].items.push({
            id: row.item_id,
            title: row.title,
            price: row.item_price,
            image: row.image_url
        });
    });

    res.json({ orders: Object.values(grouped) });
});

app.post('/api/orders', authenticate, (req, res) => {
    const cartItems = db.prepare(`
        SELECT items.*
        FROM cart_items
        JOIN items ON items.id = cart_items.item_id
        WHERE cart_items.user_id = ?
    `).all(req.user.id);
    if (cartItems.length === 0) {
        return res.status(400).json({ message: 'Panier vide' });
    }
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    const orderId = uuid();
    const expectedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const insertOrder = db.prepare('INSERT INTO orders (id, user_id, total, status, expected_delivery) VALUES (?, ?, ?, ?, ?)');
    const insertOrderItem = db.prepare('INSERT INTO order_items (order_id, item_id, price) VALUES (?, ?, ?)');
    const removeCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');

    const transaction = db.transaction(() => {
        insertOrder.run(orderId, req.user.id, total, 'processing', expectedDelivery);
        cartItems.forEach(item => insertOrderItem.run(orderId, item.id, item.price));
        removeCart.run(req.user.id);
    });
    transaction();

    res.status(201).json({ orderId, total, status: 'processing', expected_delivery: expectedDelivery });
});

// Messaging
app.get('/api/messages', authenticate, (req, res) => {
    const rows = db.prepare(`
        SELECT m.*, s.username as sender_username, r.username as receiver_username,
               i.title as item_title, i.image_url as item_image_url, i.price as item_price
        FROM messages m
        JOIN users s ON s.id = m.sender_id
        JOIN users r ON r.id = m.receiver_id
        LEFT JOIN items i ON i.id = m.item_id
        WHERE m.sender_id = ? OR m.receiver_id = ?
        ORDER BY m.created_at ASC
    `).all(req.user.id, req.user.id);

    const conversations = {};
    rows.forEach(row => {
        const otherUserId = row.sender_id === req.user.id ? row.receiver_id : row.sender_id;
        const otherUser = row.sender_id === req.user.id ? row.receiver_username : row.sender_username;
        const key = `${otherUserId}-${row.item_id || 'general'}`;
        if (!conversations[key]) {
            conversations[key] = {
                id: key,
                otherUser,
                otherUserId,
                item: row.item_id ? {
                    id: row.item_id,
                    title: row.item_title,
                    image: row.item_image_url,
                    price: row.item_price
                } : null,
                lastMessage: row.content || (row.offer_price ? `Offre ${row.offer_price}€` : ''),
                timestamp: row.created_at,
                messages: []
            };
        }
        conversations[key].lastMessage = row.content || (row.offer_price ? `Offre ${row.offer_price}€` : conversations[key].lastMessage);
        conversations[key].timestamp = row.created_at;
        conversations[key].messages.push({
            id: row.id,
            sender: row.sender_id === req.user.id ? 'me' : otherUser,
            text: row.content,
            time: row.created_at,
            offerPrice: row.offer_price,
            offerStatus: row.offer_status
        });
    });

    res.json({ conversations: Object.values(conversations) });
});

app.post('/api/messages/:username', authenticate, (req, res) => {
    const { content, itemId, offerPrice } = req.body;
    const { username } = req.params;
    if (!content && !offerPrice) {
        return res.status(400).json({ message: 'Message vide' });
    }
    const receiver = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!receiver) {
        return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    if (itemId) {
        const item = db.prepare('SELECT id FROM items WHERE id = ?').get(itemId);
        if (!item) {
            return res.status(404).json({ message: 'Article introuvable' });
        }
    }
    db.prepare('INSERT INTO messages (sender_id, receiver_id, content, item_id, offer_price, offer_status) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id,
        receiver.id,
        content || null,
        itemId || null,
        offerPrice || null,
        offerPrice ? 'pending' : null
    );
    res.status(201).json({ message: 'Envoyé' });
});

app.post('/api/messages/offer/:id', authenticate, (req, res) => {
    const { action, counterPrice } = req.body;
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
    if (!message) {
        return res.status(404).json({ message: 'Offre introuvable' });
    }
    if (message.offer_price == null) {
        return res.status(400).json({ message: 'Ce message ne contient pas d’offre' });
    }
    if (message.sender_id === req.user.id) {
        return res.status(403).json({ message: 'Vous ne pouvez pas répondre à votre propre offre' });
    }
    if (message.offer_status && message.offer_status !== 'pending') {
        return res.status(400).json({ message: 'Offre déjà traitée' });
    }
    const updateOffer = db.prepare('UPDATE messages SET offer_status = ? WHERE id = ?');
    const insertMessage = db.prepare('INSERT INTO messages (sender_id, receiver_id, content, item_id, offer_price, offer_status) VALUES (?, ?, ?, ?, ?, ?)');
    if (action === 'accept') {
        updateOffer.run('accepted', message.id);
        insertMessage.run(
            req.user.id,
            message.sender_id,
            `✅ Offre à ${message.offer_price}€ acceptée`,
            message.item_id,
            null,
            null
        );
        return res.json({ status: 'accepted' });
    }
    if (action === 'decline') {
        updateOffer.run('declined', message.id);
        insertMessage.run(
            req.user.id,
            message.sender_id,
            `❌ Offre à ${message.offer_price}€ refusée`,
            message.item_id,
            null,
            null
        );
        return res.json({ status: 'declined' });
    }
    if (action === 'counter') {
        if (!counterPrice || Number(counterPrice) <= 0) {
            return res.status(400).json({ message: 'Contre-offre invalide' });
        }
        updateOffer.run('countered', message.id);
        insertMessage.run(
            req.user.id,
            message.sender_id,
            null,
            message.item_id,
            Number(counterPrice),
            'pending'
        );
        return res.json({ status: 'countered' });
    }
    return res.status(400).json({ message: 'Action invalide' });
});

// Profile
app.get('/api/profile/:username', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
    if (!user) {
        return res.status(404).json({ message: 'Profil introuvable' });
    }
    const items = db.prepare(`
        SELECT *
        FROM items
        WHERE seller_id = ?
        ORDER BY created_at DESC
    `).all(user.id);
    const reviews = db.prepare(`
        SELECT reviewer, rating, comment, created_at
        FROM reviews
        WHERE seller_id = ?
        ORDER BY created_at DESC
    `).all(user.id);
    res.json({ profile: serializeUser(user), items, reviews });
});

// Serve SPA for non-API routes
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server ready on http://localhost:${PORT}`);
});

