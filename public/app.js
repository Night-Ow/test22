const API_BASE = '/api';
const TOKEN_KEY = 'vinted_token';

const state = {
    user: null,
    items: [],
    itemRegistry: {},
    favorites: [],
    favoriteIds: new Set(),
    cartItems: [],
    conversations: [],
    activeConversation: 0,
    filters: {
        search: '',
        category: '',
        condition: '',
        maxPrice: 200
    },
    currentItemId: null,
    currentStep: 1,
    uploadedImages: [],
    orders: [],
    pendingConversation: null
};

document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
});

async function bootstrap() {
    try {
        setupDragAndDrop();
        updatePriceValue();
        updateStepUI();
        await fetchCurrentUser();
        await loadItems();
        if (state.user) {
            await Promise.all([fetchFavorites(), fetchCart(), fetchMessages(), fetchOrders()]);
        }
        updateAuthUI();
    } catch (error) {
        console.error(error);
    }
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
    const opts = {
        method: options.method || 'GET',
        headers: options.headers ? { ...options.headers } : {}
    };
    const token = getToken();
    if (token) {
        opts.headers.Authorization = `Bearer ${token}`;
    }
    if (options.body && !(options.body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(options.body);
    } else if (options.body) {
        opts.body = options.body;
    }
    const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, opts);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data.message || 'Erreur serveur';
        throw new Error(message);
    }
    return data;
}

async function fetchCurrentUser() {
    if (!getToken()) {
        state.user = null;
        updateAuthUI();
        return;
    }
    try {
        const { user } = await apiRequest('/auth/me');
        state.user = user;
    } catch (error) {
        localStorage.removeItem(TOKEN_KEY);
        state.user = null;
    } finally {
        updateAuthUI();
    }
}

function updateAuthUI() {
    const registerBtn = document.getElementById('registerBtn');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const ordersBtn = document.getElementById('ordersBtn');
    if (!registerBtn) return;

    if (state.user) {
        registerBtn.classList.add('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        ordersBtn.classList.remove('hidden');
    } else {
        registerBtn.classList.remove('hidden');
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        ordersBtn.classList.add('hidden');
    }
}

async function loadItems() {
    const params = new URLSearchParams();
    if (state.filters.search) params.append('search', state.filters.search);
    if (state.filters.category) params.append('category', state.filters.category);
    if (state.filters.condition) params.append('condition', state.filters.condition);
    if (state.filters.maxPrice) params.append('maxPrice', state.filters.maxPrice);

    const { items } = await apiRequest(`/items?${params.toString()}`);
    state.items = items;
    items.forEach(item => {
        state.itemRegistry[item.id] = item;
    });
    renderItems(items);
}

function renderItems(items) {
    const grid = document.getElementById('itemsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!items.length) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:var(--space-32); color:var(--color-text-secondary);">Aucun article trouvé</p>';
        return;
    }
    items.forEach(item => {
        const isFavorite = state.favoriteIds.has(item.id);
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${item.id}">
                ${isFavorite ? '❤️' : '♡'}
            </button>
            <div class="item-image" data-detail="${item.id}">
                <img src="${item.image_url}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div class="item-info" data-detail="${item.id}">
                <div class="item-title">${item.title}</div>
                <div class="item-price">${item.price}€</div>
                <div class="item-meta">
                    <span>État: ${item.condition}</span>
                    <span>Taille: ${item.size}</span>
                    <span>Marque: ${item.brand}</span>
                </div>
            </div>
        `;
        card.querySelector('.favorite-btn').addEventListener('click', (evt) => {
            evt.stopPropagation();
            toggleFavorite(item.id);
        });
        card.querySelectorAll('[data-detail]').forEach(el => {
            el.addEventListener('click', () => showItemDetail(item.id));
        });
        grid.appendChild(card);
    });
}

async function showItemDetail(itemId) {
    try {
        const { item, reviews } = await apiRequest(`/items/${itemId}`);
        state.itemRegistry[item.id] = item;
        state.currentItemId = itemId;
        const content = document.getElementById('itemDetailContent');
        const isFavorite = state.favoriteIds.has(itemId);
        content.innerHTML = `
            <div class="item-detail">
                <div>
                    <div class="item-detail-image">
                        <img src="${item.image_url}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg);">
                    </div>
                </div>
                <div class="item-detail-info">
                    <h1 class="item-detail-title">${item.title}</h1>
                    <div class="item-detail-price">${item.price}€</div>
                    <div class="item-detail-meta">
                        <div><strong>État:</strong> ${item.condition}</div>
                        <div><strong>Taille:</strong> ${item.size}</div>
                        <div><strong>Marque:</strong> ${item.brand}</div>
                        <div><strong>Catégorie:</strong> ${item.category}</div>
                    </div>
                    <div>
                        <h3 style="margin-bottom:var(--space-8);">Description</h3>
                        <p style="color:var(--color-text-secondary);">${item.description}</p>
                    </div>
                    <div class="seller-info" data-profile="${item.seller_username}">
                        <div class="seller-avatar">${item.seller_username.charAt(0).toUpperCase()}</div>
                        <div class="seller-details">
                            <div class="seller-name">${item.seller_username}</div>
                            <div class="seller-rating">⭐ ${item.seller_rating ?? 0} (${item.seller_reviews ?? 0} avis)</div>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary" data-add-cart="${item.id}">🛒 Acheter</button>
                        <button class="btn btn-outline" data-favorite-detail="${item.id}">❤️ ${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button>
                    </div>
                    <button class="btn btn-secondary" data-start-conv="${item.seller_username}" data-start-item="${item.id}" style="width:100%;">💬 Poser une question</button>
                </div>
            </div>
            <div style="margin-top:var(--space-32);">
                <h2 style="margin-bottom:var(--space-16);">Avis sur le vendeur</h2>
                ${
                    reviews.length
                        ? reviews.map(review => `
                            <div class="review-card">
                                <div class="review-header">
                                    <div>
                                        <div class="review-author">${review.reviewer}</div>
                                        <div class="review-rating">${'⭐'.repeat(review.rating)}</div>
                                    </div>
                                    <div class="review-date">${new Date(review.created_at).toLocaleDateString('fr-FR')}</div>
                                </div>
                                <p>${review.comment}</p>
                            </div>
                        `).join('')
                        : '<p style="color: var(--color-text-secondary);">Aucun avis pour le moment</p>'
                }
            </div>
        `;
        content.querySelector('[data-profile]').addEventListener('click', () => showProfile(item.seller_username));
        content.querySelector('[data-add-cart]').addEventListener('click', () => addToCart(item.id));
        content.querySelector('[data-favorite-detail]').addEventListener('click', () => toggleFavorite(item.id));
        content.querySelector('[data-start-conv]').addEventListener('click', (evt) => {
            const target = evt.currentTarget;
            startConversation(target.dataset.startConv, Number(target.dataset.startItem));
        });
        showPage('itemDetail');
    } catch (error) {
        alert(error.message);
    }
}

async function fetchFavorites() {
    try {
        const { favorites } = await apiRequest('/favorites');
        state.favorites = favorites;
        state.favoriteIds = new Set(favorites.map(item => item.id));
        favorites.forEach(item => {
            state.itemRegistry[item.id] = item;
        });
    } catch (error) {
        console.error(error);
    }
}

function renderFavorites() {
    const grid = document.getElementById('favoritesGrid');
    if (!state.user) {
        grid.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Connectez-vous pour consulter vos favoris.</p>';
        return;
    }
    if (!state.favorites.length) {
        grid.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Vous n\'avez pas encore de favoris.</p>';
        return;
    }
    grid.innerHTML = state.favorites.map(item => `
        <div class="item-card">
            <button class="favorite-btn active" data-remove-fav="${item.id}">❤️</button>
            <div class="item-image" data-detail="${item.id}">
                <img src="${item.image_url}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div class="item-info" data-detail="${item.id}">
                <div class="item-title">${item.title}</div>
                <div class="item-price">${item.price}€</div>
                <div class="item-meta">
                    <span>État: ${item.condition}</span>
                    <span>Taille: ${item.size}</span>
                </div>
            </div>
        </div>
    `).join('');
    grid.querySelectorAll('[data-remove-fav]').forEach(btn => {
        btn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            toggleFavorite(Number(btn.dataset.removeFav));
        });
    });
    grid.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => showItemDetail(Number(el.dataset.detail))));
}

async function toggleFavorite(itemId) {
    if (!state.user) {
        alert('Veuillez vous connecter pour utiliser les favoris');
        showLoginModal();
        return;
    }
    try {
        const { favorited } = await apiRequest(`/items/${itemId}/favorite`, { method: 'POST' });
        if (favorited) {
            state.favoriteIds.add(itemId);
        } else {
            state.favoriteIds.delete(itemId);
        }
        await fetchFavorites();
        renderItems(state.items);
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'itemDetailPage') {
            showItemDetail(itemId);
        } else if (currentPage === 'favoritesPage') {
            renderFavorites();
        }
    } catch (error) {
        alert(error.message);
    }
}

async function fetchCart() {
    if (!state.user) {
        state.cartItems = [];
        return;
    }
    try {
        const { items } = await apiRequest('/cart');
        state.cartItems = items;
        items.forEach(item => {
            state.itemRegistry[item.id] = item;
        });
    } catch (error) {
        console.error(error);
    }
}

async function fetchOrders() {
    if (!state.user) {
        state.orders = [];
        return;
    }
    try {
        const { orders } = await apiRequest('/orders');
        state.orders = orders;
    } catch (error) {
        console.error(error);
    }
}

function renderCart() {
    const container = document.getElementById('cartContent');
    if (!state.user) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Connectez-vous pour voir votre panier.</p>';
        return;
    }
    if (!state.cartItems.length) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Votre panier est vide.</p>';
        return;
    }
    const total = state.cartItems.reduce((sum, item) => sum + item.price, 0);
    container.innerHTML = `
        <div class="cart-items">
            ${state.cartItems.map(item => `
                <div class="cart-item">
                    <img src="${item.image_url}" alt="${item.title}" class="cart-item-image">
                    <div class="cart-item-info">
                        <div class="cart-item-title">${item.title}</div>
                        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin:var(--space-4) 0;">Taille: ${item.size} • État: ${item.condition}</div>
                        <div class="cart-item-price">${item.price}€</div>
                    </div>
                    <button class="btn btn-outline" data-remove-cart="${item.id}" style="height:fit-content;">Retirer</button>
                </div>
            `).join('')}
        </div>
        <div class="cart-summary">
            <div class="cart-total">
                <span>Total:</span>
                <span>${total}€</span>
            </div>
            <button class="btn btn-primary" style="width:100%;" onclick="proceedToCheckout()">Passer la commande</button>
        </div>
    `;
    container.querySelectorAll('[data-remove-cart]').forEach(btn => {
        btn.addEventListener('click', () => removeFromCart(btn.dataset.removeCart));
    });
}

async function addToCart(itemId) {
    if (!state.user) {
        alert('Veuillez vous connecter pour ajouter au panier');
        showLoginModal();
        return;
    }
    try {
        const { items } = await apiRequest('/cart', {
            method: 'POST',
            body: { itemId }
        });
        state.cartItems = items;
        alert('Article ajouté au panier');
    } catch (error) {
        alert(error.message);
    }
}

async function removeFromCart(itemId) {
    try {
        const { items } = await apiRequest(`/cart/${itemId}`, { method: 'DELETE' });
        state.cartItems = items;
        renderCart();
    } catch (error) {
        alert(error.message);
    }
}

function proceedToCheckout() {
    if (!state.user) {
        alert('Veuillez vous connecter pour finaliser votre commande');
        showLoginModal();
        return;
    }
    if (!state.cartItems.length) {
        alert('Votre panier est vide');
        return;
    }
    const total = state.cartItems.reduce((sum, item) => sum + item.price, 0);
    const content = document.getElementById('checkoutContent');
    content.innerHTML = `
        <div class="cart-summary" style="margin-bottom:var(--space-24);">
            <h3 style="margin-bottom:var(--space-16);">Résumé de la commande</h3>
            ${state.cartItems.map(item => `
                <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-8);">
                    <span>${item.title}</span>
                    <span>${item.price}€</span>
                </div>
            `).join('')}
            <div class="cart-total" style="margin-top:var(--space-16);padding-top:var(--space-16);border-top:1px solid var(--color-border);">
                <span>Total:</span>
                <span>${total}€</span>
            </div>
        </div>
        <form id="checkoutForm">
            <h3 style="margin-bottom:var(--space-16);">Adresse de livraison</h3>
            <div class="form-group">
                <label>Nom complet</label>
                <input type="text" name="fullName" required>
            </div>
            <div class="form-group">
                <label>Adresse</label>
                <input type="text" name="address" required>
            </div>
            <div class="form-group">
                <label>Code postal</label>
                <input type="text" name="zip" required>
            </div>
            <div class="form-group">
                <label>Ville</label>
                <input type="text" name="city" required>
            </div>
            <div class="form-group">
                <label>Téléphone</label>
                <input type="tel" name="phone" required>
            </div>
            <div style="background-color:var(--color-bg-5);padding:var(--space-16);border-radius:var(--radius-base);margin:var(--space-20) 0;">
                <h4 style="margin-bottom:var(--space-12);">💳 Paiement (Simulation)</h4>
                <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Le paiement réel s'effectuerait via Stripe dans une version production.</p>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;">Confirmer et payer ${total}€</button>
        </form>
    `;
    document.getElementById('checkoutForm').addEventListener('submit', completeOrder);
    showPage('checkout');
}

async function completeOrder(event) {
    event.preventDefault();
    try {
        const { orderId, total } = await apiRequest('/orders', { method: 'POST' });
        alert(`✅ Commande ${orderId} confirmée pour ${total}€`);
        await Promise.all([fetchCart(), fetchOrders()]);
        showPage('home');
    } catch (error) {
        alert(error.message);
    }
}

function renderOrders() {
    const container = document.getElementById('ordersContent');
    if (!state.user) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Veuillez vous connecter pour consulter vos commandes.</p>';
        return;
    }
    if (!state.orders.length) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Vous n\'avez pas encore de commande.</p>';
        return;
    }
    const now = Date.now();
    const upcoming = state.orders.filter(order => {
        const expected = order.expected_delivery ? Date.parse(order.expected_delivery) : Date.now() + 3 * 24 * 60 * 60 * 1000;
        return order.status !== 'delivered' && expected >= now;
    });
    const past = state.orders.filter(order => !upcoming.includes(order));

    const statusLabels = {
        processing: 'En préparation',
        shipped: 'Expédiée',
        delivered: 'Livrée',
        cancelled: 'Annulée'
    };

    const renderList = (ordersList) => ordersList.map(order => `
        <div class="cart-item" style="flex-direction:column;">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                <div>
                    <strong>Commande #${order.id}</strong>
                    <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Passée le ${new Date(order.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:var(--font-weight-bold);">${order.total}€</div>
                    <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">${statusLabels[order.status] || order.status || ''} • ${order.expected_delivery ? `Livraison estimée : ${new Date(order.expected_delivery).toLocaleDateString('fr-FR')}` : ''}</div>
                </div>
            </div>
            <div style="display:flex;gap:var(--space-12);margin-top:var(--space-12);flex-wrap:wrap;">
                ${order.items.map(item => `
                    <div style="display:flex;align-items:center;gap:var(--space-8);border:1px solid var(--color-border);padding:var(--space-8);border-radius:var(--radius-base);">
                        <img src="${item.image}" alt="${item.title}" style="width:60px;height:60px;border-radius:var(--radius-base);object-fit:cover;">
                        <div>
                            <div style="font-weight:var(--font-weight-medium);">${item.title}</div>
                            <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">${item.price}€</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div style="margin-bottom:var(--space-24);">
            <h3>Commandes en cours</h3>
            ${upcoming.length ? renderList(upcoming) : '<p style="color:var(--color-text-secondary);margin-top:var(--space-12);">Aucune commande en cours.</p>'}
        </div>
        <div>
            <h3>Commandes passées</h3>
            ${past.length ? renderList(past) : '<p style="color:var(--color-text-secondary);margin-top:var(--space-12);">Aucune commande livrée pour le moment.</p>'}
        </div>
    `;
}

async function showProfile(username) {
    try {
        const { profile, items, reviews } = await apiRequest(`/profile/${username}`);
        const container = document.getElementById('profileContent');
        container.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">${profile.username.charAt(0).toUpperCase()}</div>
                <div class="profile-info">
                    <h2>${profile.username}</h2>
                    <div class="profile-stats">
                        <span>⭐ ${profile.rating ?? 0} (${profile.reviews_count ?? 0} avis)</span>
                        <span>📦 ${items.length} articles en vente</span>
                    </div>
                    <p style="margin-top:var(--space-8);color:var(--color-text-secondary);">${profile.bio}</p>
                </div>
            </div>
            <div class="tabs">
                <div class="tab active" data-tab="items">Articles en vente</div>
                <div class="tab" data-tab="reviews">Avis reçus</div>
            </div>
            <div class="tab-content active" id="itemsTab">
                <div class="items-grid">
                    ${items.map(item => `
                        <div class="item-card" data-detail="${item.id}">
                            <div class="item-image">
                                <img src="${item.image_url}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
                            </div>
                            <div class="item-info">
                                <div class="item-title">${item.title}</div>
                                <div class="item-price">${item.price}€</div>
                                <div class="item-meta">
                                    <span>État: ${item.condition}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="tab-content" id="reviewsTab">
                ${
                    reviews.length
                        ? reviews.map(review => `
                            <div class="review-card">
                                <div class="review-header">
                                    <div>
                                        <div class="review-author">${review.reviewer}</div>
                                        <div class="review-rating">${'⭐'.repeat(review.rating)}</div>
                                    </div>
                                    <div class="review-date">${new Date(review.created_at).toLocaleDateString('fr-FR')}</div>
                                </div>
                                <p>${review.comment}</p>
                            </div>
                        `).join('')
                        : '<p style="color:var(--color-text-secondary);">Aucun avis pour le moment</p>'
                }
            </div>
        `;
        container.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => switchTab(e, tab.dataset.tab));
        });
        container.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => showItemDetail(Number(el.dataset.detail))));
        showPage('profile');
    } catch (error) {
        alert(error.message);
    }
}

function switchTab(event, tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

async function fetchMessages() {
    if (!state.user) {
        state.conversations = [];
        return;
    }
    try {
        const { conversations } = await apiRequest('/messages');
        state.conversations = conversations;
        if (state.pendingConversation) {
            focusConversation(state.pendingConversation.username, state.pendingConversation.itemId);
        } else if (state.conversations.length) {
            const currentIndex = typeof state.activeConversation === 'number' ? state.activeConversation : 0;
            state.activeConversation = Math.min(currentIndex, state.conversations.length - 1);
        }
    } catch (error) {
        console.error(error);
    }
}

function focusConversation(username, itemId) {
    const index = state.conversations.findIndex(conv =>
        conv.otherUser === username &&
        ((itemId && conv.item && conv.item.id === itemId) || (!itemId && !conv.item))
    );
    if (index >= 0) {
        state.activeConversation = index;
    } else if (itemId) {
        const item = state.itemRegistry[itemId] || state.items.find(i => i.id === itemId);
        state.conversations.unshift({
            id: `temp-${Date.now()}`,
            otherUser: username,
            otherUserId: null,
            item: item ? { id: item.id, title: item.title, image: item.image_url, price: item.price } : null,
            lastMessage: '',
            timestamp: new Date().toISOString(),
            messages: []
        });
        state.activeConversation = 0;
    }
    state.pendingConversation = null;
}

function renderMessages() {
    const container = document.getElementById('messagingContainer');
    if (!state.user) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Veuillez vous connecter pour accéder à vos messages</p>';
        return;
    }
    if (!state.conversations.length) {
        container.innerHTML = '<p style="text-align:center;padding:var(--space-32);color:var(--color-text-secondary);">Aucune conversation pour le moment. Sélectionnez un article pour poser une question.</p>';
        return;
    }
    const activeConv = state.conversations[state.activeConversation] || state.conversations[0];
    container.innerHTML = `
        <div class="messaging-container">
            <div class="conversations-list">
                ${state.conversations.map((conv, index) => `
                    <div class="conversation-item ${index === state.activeConversation ? 'active' : ''}" data-conv="${index}">
                        <div class="conversation-name">${conv.otherUser}</div>
                        ${conv.item ? `<div class="conversation-preview">${conv.item.title}</div>` : `<div class="conversation-preview">${conv.lastMessage || 'Nouvelle conversation'}</div>`}
                        <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);margin-top:var(--space-4);">${new Date(conv.timestamp).toLocaleString('fr-FR')}</div>
                    </div>
                `).join('')}
            </div>
            <div class="chat-area">
                <div class="chat-header">
                    <div style="font-weight:var(--font-weight-semibold);">${activeConv.otherUser}</div>
                    ${activeConv.item ? `<div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Article: ${activeConv.item.title} (${activeConv.item.price}€)</div>` : ''}
                </div>
                <div class="messages-container" id="messagesContainer">
                    ${activeConv.messages.map(msg => {
                        const statusMap = {
                            pending: 'En attente',
                            accepted: 'Acceptée',
                            declined: 'Refusée',
                            countered: 'Contre-proposée'
                        };
                        const statusLabel = msg.offerPrice ? statusMap[msg.offerStatus || 'pending'] : '';
                        const actionButtons = msg.offerPrice && msg.sender !== 'me' && (msg.offerStatus || 'pending') === 'pending' ? `
                            <div style="margin-top:var(--space-8);display:flex;gap:var(--space-8);flex-wrap:wrap;">
                                <button class="btn btn-primary" data-accept="${msg.id}" style="padding:6px 12px;">Accepter</button>
                                <button class="btn btn-outline" data-decline="${msg.id}" style="padding:6px 12px;">Refuser</button>
                                <button class="btn btn-secondary" data-counter="${msg.id}" style="padding:6px 12px;">Contre-proposer</button>
                            </div>
                        ` : '';
                        return `
                            <div class="message ${msg.sender === 'me' ? 'sent' : 'received'}">
                                ${msg.offerPrice ? `<div><strong>Proposition: ${msg.offerPrice}€</strong> <span style="font-size:var(--font-size-xs);margin-left:8px;">${statusLabel}</span></div>` : ''}
                                ${msg.text ? `<div>${msg.text}</div>` : ''}
                                <div class="message-time">${new Date(msg.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                                ${actionButtons}
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="message-input">
                    <input type="text" placeholder="Tapez votre message..." id="messageInput">
                    <input type="number" placeholder="Proposer un prix (€)" id="offerPriceInput" min="1" step="0.5">
                    <button class="btn btn-primary" id="sendMessageBtn">Envoyer</button>
                </div>
            </div>
        </div>
    `;
    container.querySelectorAll('[data-conv]').forEach(item => {
        item.addEventListener('click', () => selectConversation(Number(item.dataset.conv)));
    });
    document.getElementById('messageInput').addEventListener('keypress', handleMessageKeyPress);
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    container.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => respondToOffer(btn.dataset.accept, 'accept')));
    container.querySelectorAll('[data-decline]').forEach(btn => btn.addEventListener('click', () => respondToOffer(btn.dataset.decline, 'decline')));
    container.querySelectorAll('[data-counter]').forEach(btn => btn.addEventListener('click', () => {
        const value = parseFloat(prompt('Quel nouveau prix proposez-vous ?'));
        if (!value || value <= 0) return;
        respondToOffer(btn.dataset.counter, 'counter', value);
    }));
}

function selectConversation(index) {
    state.activeConversation = index;
    renderMessages();
}

function handleMessageKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const conv = state.conversations[state.activeConversation];
    const input = document.getElementById('messageInput');
    const offerInput = document.getElementById('offerPriceInput');
    const message = input.value.trim();
    const offerPrice = parseFloat(offerInput.value);
    const hasOffer = !Number.isNaN(offerPrice) && offerPrice > 0;
    if (!message && !hasOffer) return;
    try {
        await apiRequest(`/messages/${conv.otherUser}`, {
            method: 'POST',
            body: {
                content: message || null,
                itemId: conv.item?.id || null,
                offerPrice: hasOffer ? offerPrice : null
            }
        });
        input.value = '';
        offerInput.value = '';
        await fetchMessages();
        renderMessages();
    } catch (error) {
        alert(error.message);
    }
}

async function respondToOffer(messageId, action, counterPrice) {
    try {
        const body = { action };
        if (counterPrice) {
            body.counterPrice = Number(counterPrice);
        }
        await apiRequest(`/messages/offer/${messageId}`, {
            method: 'POST',
            body
        });
        await fetchMessages();
        renderMessages();
    } catch (error) {
        alert(error.message);
    }
}

function startConversation(username, itemId) {
    if (!state.user) {
        alert('Connectez-vous pour envoyer un message');
        showLoginModal();
        return;
    }
    state.pendingConversation = { username, itemId };
    showPage('messages');
    fetchMessages().then(() => {
        if (state.pendingConversation) {
            focusConversation(username, itemId);
        }
        renderMessages();
    });
}

// Sell form helpers
function showSellForm() {
    if (!state.user) {
        alert('Veuillez vous connecter pour vendre un article');
        showLoginModal();
        return;
    }
    document.getElementById('sellModal').classList.add('active');
}

function showRegisterModal() {
    document.getElementById('registerModal').classList.add('active');
}

function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'sellModal') {
        resetSellForm();
    }
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    state.user = null;
    state.favorites = [];
    state.favoriteIds.clear();
    state.cartItems = [];
    state.orders = [];
    updateAuthUI();
    showPage('home');
    alert('Vous êtes déconnecté');
}

async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;

    document.getElementById('regUsernameError').textContent = '';
    document.getElementById('regEmailError').textContent = '';
    document.getElementById('regPasswordError').textContent = '';
    document.getElementById('regPasswordConfirmError').textContent = '';

    if (!username) {
        document.getElementById('regUsernameError').textContent = 'Le nom d’utilisateur est requis';
        return;
    }
    if (!email.includes('@')) {
        document.getElementById('regEmailError').textContent = 'Email invalide';
        return;
    }
    if (password.length < 6) {
        document.getElementById('regPasswordError').textContent = '6 caractères minimum';
        return;
    }
    if (password !== confirm) {
        document.getElementById('regPasswordConfirmError').textContent = 'Les mots de passe ne correspondent pas';
        return;
    }
    try {
        const { token, user } = await apiRequest('/auth/register', {
            method: 'POST',
            body: { username, email, password }
        });
        localStorage.setItem(TOKEN_KEY, token);
        state.user = user;
        closeModal('registerModal');
        updateAuthUI();
        await Promise.all([fetchFavorites(), fetchCart(), fetchMessages(), fetchOrders()]);
        alert(`Inscription réussie! Bienvenue ${user.username}`);
    } catch (error) {
        document.getElementById('regUsernameError').textContent = error.message;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const credential = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    document.getElementById('loginError').textContent = '';
    try {
        const { token, user } = await apiRequest('/auth/login', {
            method: 'POST',
            body: { credential, password }
        });
        localStorage.setItem(TOKEN_KEY, token);
        state.user = user;
        closeModal('loginModal');
        updateAuthUI();
        await Promise.all([fetchFavorites(), fetchCart(), fetchMessages(), fetchOrders()]);
        alert(`Connexion réussie! Bienvenue ${user.username}`);
    } catch (error) {
        document.getElementById('loginError').textContent = error.message;
    }
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(`${pageName}Page`).classList.add('active');
    if (pageName === 'favorites') {
        renderFavorites();
    } else if (pageName === 'cart') {
        renderCart();
    } else if (pageName === 'messages') {
        renderMessages();
    } else if (pageName === 'orders') {
        renderOrders();
        fetchOrders().then(renderOrders);
    }
}

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'));
    });
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'));
    });
    uploadArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function handleFileSelect(event) {
    handleFiles(event.target.files);
}

function handleFiles(files) {
    [...files].forEach(file => {
        if (state.uploadedImages.length < 5 && file.type.startsWith('image/')) {
            state.uploadedImages.push(file);
        }
    });
    renderImagePreview();
}

function renderImagePreview() {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    state.uploadedImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="remove-image" data-remove-img="${index}">×</button>
            `;
            preview.appendChild(div);
            div.querySelector('[data-remove-img]').addEventListener('click', () => removeImage(index));
        };
        reader.readAsDataURL(file);
    });
}

function removeImage(index) {
    state.uploadedImages.splice(index, 1);
    renderImagePreview();
}

function nextStep() {
    if (state.currentStep < 4) {
        state.currentStep += 1;
        updateStepUI();
    }
}

function previousStep() {
    if (state.currentStep > 1) {
        state.currentStep -= 1;
        updateStepUI();
    }
}

function updateStepUI() {
    document.querySelectorAll('.step').forEach((step, idx) => {
        step.classList.remove('active', 'completed');
        if (idx + 1 < state.currentStep) {
            step.classList.add('completed');
        } else if (idx + 1 === state.currentStep) {
            step.classList.add('active');
        }
    });
    document.querySelectorAll('.form-step').forEach((step, idx) => {
        step.classList.toggle('active', idx + 1 === state.currentStep);
    });
    document.getElementById('prevBtn').style.display = state.currentStep === 1 ? 'none' : 'block';
    document.getElementById('nextBtn').style.display = state.currentStep === 4 ? 'none' : 'block';
    document.getElementById('submitBtn').style.display = state.currentStep === 4 ? 'block' : 'none';
}

function resetSellForm() {
    state.currentStep = 1;
    state.uploadedImages = [];
    document.getElementById('sellForm').reset();
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('imageAnalysisResult').innerHTML = '';
    document.getElementById('aiDescriptions').innerHTML = '';
    document.getElementById('priceSuggestion').innerHTML = '';
    document.getElementById('sellSuccessMessage').classList.add('hidden');
    updateStepUI();
}

async function handleSellSubmit(event) {
    event.preventDefault();
    if (!state.user) {
        alert('Veuillez vous connecter');
        return;
    }
    const imageData = state.uploadedImages.length ? await fileToDataUrl(state.uploadedImages[0]) : null;
    const payload = {
        title: document.getElementById('sellTitle').value,
        description: document.getElementById('sellDescription').value,
        category: document.getElementById('sellCategory').value,
        brand: document.getElementById('sellBrand').value,
        condition: document.getElementById('sellCondition').value,
        size: document.getElementById('sellSize').value,
        price: Number(document.getElementById('sellPrice').value),
        image: imageData
    };
    try {
        await apiRequest('/items', { method: 'POST', body: payload });
        document.getElementById('sellSuccessMessage').classList.remove('hidden');
        await loadItems();
        setTimeout(() => {
            closeModal('sellModal');
            showPage('home');
        }, 1500);
    } catch (error) {
        alert(error.message);
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function simulateImageAnalysis() {
    const result = document.getElementById('imageAnalysisResult');
    if (!state.uploadedImages.length) {
        result.innerHTML = '<div class="ai-warning">⚠️ Veuillez d\'abord télécharger des photos</div>';
        return;
    }
    setTimeout(() => {
        result.innerHTML = `
            <div style="margin-top:var(--space-12);padding:var(--space-12);background-color:var(--color-surface);border-radius:var(--radius-base);border:1px solid var(--color-border);">
                <p style="font-weight:var(--font-weight-semibold);margin-bottom:var(--space-8);color:var(--color-success);">✅ Analyse terminée</p>
                <ul style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-left:var(--space-20);">
                    <li>Article conforme aux conditions d'utilisation</li>
                    <li>Qualité de l'image: Bonne</li>
                    <li>Catégorie suggérée: ${document.getElementById('sellCategory').value || 'Vêtements'}</li>
                </ul>
            </div>
        `;
    }, 1000);
}

function generateAIDescriptions() {
    const title = document.getElementById('sellTitle').value;
    const category = document.getElementById('sellCategory').value;
    if (!title || !category) {
        alert('Veuillez remplir le titre et la catégorie');
        return;
    }
    const descriptions = [
        `${title} en excellent état. Article de qualité parfait pour compléter votre garde-robe. Très confortable et élégant, idéal pour toutes les occasions.`,
        `Magnifique ${title.toLowerCase()} à vendre! Porté avec soin et en très bon état. Un incontournable pour les amateurs de mode qui recherchent qualité et style.`,
        `${title} comme neuf! Article tendance et intemporel qui saura vous séduire. Profitez de cette belle opportunité pour acquérir cet article à prix réduit.`
    ];
    const container = document.getElementById('aiDescriptions');
    container.innerHTML = descriptions.map((desc, idx) => `
        <div class="ai-suggestion" data-ai-desc="${idx}">
            <strong>Option ${idx + 1}:</strong> ${desc}
        </div>
    `).join('');
    container.querySelectorAll('[data-ai-desc]').forEach(el => {
        el.addEventListener('click', () => selectAIDescription(descriptions[Number(el.dataset.aiDesc)]));
    });
}

function selectAIDescription(description) {
    document.getElementById('sellDescription').value = description;
    alert('Description sélectionnée!');
}

function suggestPrice() {
    const category = document.getElementById('sellCategory').value;
    const condition = document.getElementById('sellCondition').value;
    const brand = document.getElementById('sellBrand').value;
    if (!category || !condition) {
        alert('Veuillez renseigner la catégorie et l’état');
        return;
    }
    let basePrice = 30;
    if (category === 'Électronique') basePrice = 150;
    if (category === 'Chaussures') basePrice = 50;
    if (category === 'Accessoires') basePrice = 25;
    if (condition === 'Neuf') basePrice *= 1.5;
    if (condition === 'Très bon état') basePrice *= 1.2;
    if (condition === 'Acceptable') basePrice *= 0.7;
    if (brand && /(nike|adidas|apple|samsung|ray-ban)/i.test(brand)) {
        basePrice *= 1.3;
    }
    const minPrice = Math.floor(basePrice * 0.8);
    const maxPrice = Math.ceil(basePrice * 1.2);
    document.getElementById('priceSuggestion').innerHTML = `
        <div style="margin-top:var(--space-12);padding:var(--space-12);background-color:var(--color-surface);border-radius:var(--radius-base);border:1px solid var(--color-border);">
            <p style="font-weight:var(--font-weight-semibold);margin-bottom:var(--space-8);">💡 Prix suggéré</p>
            <p style="font-size:var(--font-size-lg);color:var(--color-primary);font-weight:var(--font-weight-bold);">${minPrice}€ - ${maxPrice}€</p>
            <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-top:var(--space-4);">Basé sur des articles similaires vendus récemment</p>
            <button type="button" class="btn btn-outline" style="width:100%;margin-top:var(--space-8);" onclick="document.getElementById('sellPrice').value = ${Math.floor(basePrice)}">Utiliser ${Math.floor(basePrice)}€</button>
        </div>
    `;
}

function updatePriceSuggestion() {
    if (document.getElementById('priceSuggestion').innerHTML) {
        suggestPrice();
    }
}

function performSearch() {
    state.filters.search = document.getElementById('searchInput').value.trim();
    applyFilters();
}

function applyFilters() {
    state.filters.category = document.getElementById('categoryFilter').value;
    state.filters.condition = document.getElementById('conditionFilter').value;
    state.filters.maxPrice = document.getElementById('priceFilter').value;
    loadItems();
}

function updatePriceValue() {
    const value = document.getElementById('priceFilter').value;
    document.getElementById('priceValue').textContent = value;
}

// Expose functions globally for inline handlers
window.showSellForm = showSellForm;
window.showRegisterModal = showRegisterModal;
window.showLoginModal = showLoginModal;
window.closeModal = closeModal;
window.logout = logout;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.showPage = showPage;
window.performSearch = performSearch;
window.applyFilters = applyFilters;
window.updatePriceValue = updatePriceValue;
window.showItemDetail = showItemDetail;
window.toggleFavorite = toggleFavorite;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.proceedToCheckout = proceedToCheckout;
window.completeOrder = completeOrder;
window.showProfile = showProfile;
window.switchTab = switchTab;
window.startConversation = startConversation;
window.selectConversation = selectConversation;
window.handleMessageKeyPress = handleMessageKeyPress;
window.sendMessage = sendMessage;
window.handleFileSelect = handleFileSelect;
window.handleSellSubmit = handleSellSubmit;
window.nextStep = nextStep;
window.previousStep = previousStep;
window.simulateImageAnalysis = simulateImageAnalysis;
window.generateAIDescriptions = generateAIDescriptions;
window.suggestPrice = suggestPrice;
window.updatePriceSuggestion = updatePriceSuggestion;

