const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { v4: uuid } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'vinted.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const createTables = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            bio TEXT DEFAULT '',
            rating REAL DEFAULT 0,
            reviews_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            price REAL NOT NULL,
            condition TEXT NOT NULL,
            category TEXT NOT NULL,
            size TEXT NOT NULL,
            brand TEXT NOT NULL,
            image_url TEXT NOT NULL,
            seller_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS favorites (
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cart_items (
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'processing',
            expected_delivery TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS order_items (
            order_id TEXT NOT NULL,
            item_id INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seller_id INTEGER NOT NULL,
            reviewer TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT,
            item_id INTEGER,
            offer_price REAL,
            offer_status TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
        );
    `);
};

const ensureColumns = () => {
    const ensure = (table, column, ddl) => {
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        if (!info.find(col => col.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        }
    };

    ensure('orders', 'status', `status TEXT DEFAULT 'processing'`);
    ensure('orders', 'expected_delivery', 'expected_delivery TEXT');
    ensure('messages', 'item_id', 'item_id INTEGER REFERENCES items(id) ON DELETE SET NULL');
    ensure('messages', 'offer_price', 'offer_price REAL');
    ensure('messages', 'offer_status', 'offer_status TEXT');
};

const seedData = () => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount > 0) return;

    const sampleUsers = [
        { username: 'marie_123', email: 'marie@example.com', password: 'password123', bio: 'Vendeuse de vêtements de qualité', rating: 4.5, reviews: 27 },
        { username: 'jean_running', email: 'jean@example.com', password: 'password123', bio: 'Passionné par le running', rating: 4.8, reviews: 8 },
        { username: 'sophie_style', email: 'sophie@example.com', password: 'password123', bio: 'Accessoires de mode tendance', rating: 4.6, reviews: 15 },
        { username: 'tech_lover', email: 'tech@example.com', password: 'password123', bio: 'Technologie et gadgets', rating: 4.9, reviews: 20 }
    ];

    const insertUser = db.prepare(`
        INSERT INTO users (username, email, password_hash, bio, rating, reviews_count)
        VALUES (@username, @email, @password_hash, @bio, @rating, @reviews_count)
    `);

    const userIdMap = {};
    sampleUsers.forEach(user => {
        const password_hash = bcrypt.hashSync(user.password, 10);
        const result = insertUser.run({
            username: user.username,
            email: user.email,
            password_hash,
            bio: user.bio,
            rating: user.rating,
            reviews_count: user.reviews
        });
        userIdMap[user.username] = result.lastInsertRowid;
    });

    const sampleItems = [
        { title: 'Robe Rouge Été Taille M', price: 25, condition: 'Très bon état', category: 'Vêtements', seller: 'marie_123', image: 'https://via.placeholder.com/400x500/ff6b6b/ffffff?text=Robe+Rouge', description: "Robe rouge légère, parfaite pour l'été. Portée 2 fois seulement. Très confortable et élégante.", size: 'M', brand: 'Zara' },
        { title: 'Baskets Nike Air Max', price: 60, condition: 'Bon état', category: 'Chaussures', seller: 'jean_running', image: 'https://via.placeholder.com/400x500/4ecdc4/ffffff?text=Nike+Air+Max', description: 'Baskets de sport Nike en bon état. Très confortables pour la course. Quelques traces d\'usure normales.', size: '42', brand: 'Nike' },
        { title: 'Sac à Main Cuir Marron', price: 45, condition: 'Très bon état', category: 'Accessoires', seller: 'sophie_style', image: 'https://via.placeholder.com/400x500/8B4513/ffffff?text=Sac+Cuir', description: 'Sac à main en cuir véritable, style vintage. Excellent état, très peu utilisé. Nombreux compartiments.', size: 'Unique', brand: 'Fossil' },
        { title: 'MacBook Pro 13" 2020', price: 900, condition: 'Très bon état', category: 'Électronique', seller: 'tech_lover', image: 'https://via.placeholder.com/400x500/95a5a6/ffffff?text=MacBook+Pro', description: 'MacBook Pro 13 pouces 2020. État quasi neuf, aucune rayure. Batterie en excellent état. Vendu avec chargeur.', size: '13 pouces', brand: 'Apple' },
        { title: 'Chemise Blanche Coton', price: 18, condition: 'Neuf', category: 'Vêtements', seller: 'marie_123', image: 'https://via.placeholder.com/400x500/ffffff/333333?text=Chemise+Blanche', description: 'Chemise blanche en coton pur, jamais portée avec étiquette. Coupe classique et intemporelle.', size: 'S', brand: 'H&M' },
        { title: 'Bottes Cuir Noir', price: 75, condition: 'Bon état', category: 'Chaussures', seller: 'sophie_style', image: 'https://via.placeholder.com/400x500/000000/ffffff?text=Bottes+Cuir', description: "Bottes en cuir véritable, élégantes et confortables. Parfaites pour l'automne et l'hiver.", size: '38', brand: 'Minelli' },
        { title: 'Montre Connectée Samsung', price: 150, condition: 'Très bon état', category: 'Électronique', seller: 'tech_lover', image: 'https://via.placeholder.com/400x500/000080/ffffff?text=Samsung+Watch', description: 'Montre connectée Samsung Galaxy Watch. Fonctionne parfaitement, quelques micro-rayures.', size: 'Unique', brand: 'Samsung' },
        { title: 'Veste en Jean', price: 35, condition: 'Très bon état', category: 'Vêtements', seller: 'marie_123', image: 'https://via.placeholder.com/400x500/5dade2/ffffff?text=Veste+Jean', description: 'Veste en jean classique, couleur bleu clair. Parfait état, très peu portée.', size: 'M', brand: "Levi's" }
    ];

    const insertItem = db.prepare(`
        INSERT INTO items (title, description, price, condition, category, size, brand, image_url, seller_id)
        VALUES (@title, @description, @price, @condition, @category, @size, @brand, @image_url, @seller_id)
    `);

    const itemIdMap = {};
    sampleItems.forEach(item => {
        const result = insertItem.run({
            title: item.title,
            description: item.description,
            price: item.price,
            condition: item.condition,
            category: item.category,
            size: item.size,
            brand: item.brand,
            image_url: item.image,
            seller_id: userIdMap[item.seller]
        });
        itemIdMap[item.title] = result.lastInsertRowid;
    });

    const reviews = [
        { seller: 'marie_123', reviewer: 'luc_buyer', rating: 5, comment: "Excellent service, livraison rapide! Article conforme à la description." },
        { seller: 'sophie_style', reviewer: 'clara_22', rating: 4, comment: 'Très contente de mon achat. Le sac est superbe, juste quelques petites traces.' },
        { seller: 'tech_lover', reviewer: 'paul_tech', rating: 5, comment: 'Vendeur sérieux, produit en excellent état. Je recommande!' },
        { seller: 'marie_123', reviewer: 'emma_style', rating: 4, comment: 'Belle robe, conforme aux photos. Livraison un peu longue.' }
    ];

    const insertReview = db.prepare(`
        INSERT INTO reviews (seller_id, reviewer, rating, comment)
        VALUES (@seller_id, @reviewer, @rating, @comment)
    `);

    reviews.forEach(review => {
        insertReview.run({
            seller_id: userIdMap[review.seller],
            reviewer: review.reviewer,
            rating: review.rating,
            comment: review.comment
        });
    });

    const messageSamples = [
        {
            sender: 'marie_123',
            receiver: 'jean_running',
            content: "Oui, l'article est toujours disponible!",
            item: 'Robe Rouge Été Taille M'
        },
        {
            sender: 'jean_running',
            receiver: 'marie_123',
            content: 'Parfait! Est-ce que vous acceptez les négociations?',
            item: 'Robe Rouge Été Taille M'
        },
        {
            sender: 'sophie_style',
            receiver: 'marie_123',
            content: 'Merci pour votre achat!',
            item: 'Sac à Main Cuir Marron'
        }
    ];

    const insertMessage = db.prepare(`
        INSERT INTO messages (sender_id, receiver_id, content, item_id)
        VALUES (@sender_id, @receiver_id, @content, @item_id)
    `);

    messageSamples.forEach(msg => {
        insertMessage.run({
            sender_id: userIdMap[msg.sender],
            receiver_id: userIdMap[msg.receiver],
            content: msg.content,
            item_id: itemIdMap[msg.item] || null
        });
    });
};

createTables();
ensureColumns();
seedData();

module.exports = { db, uuid };

