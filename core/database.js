const fs = require('fs');
const path = require('path');

const USERS_FILE = process.env.USERS_FILE || './data/users.json';
const PRODUCTS_FILE = process.env.PRODUCTS_FILE || './data/products.json';
const ORDERS_FILE = process.env.ORDERS_FILE || './data/orders.json';

// Load data from JSON files
function loadDatabase() {
    try {
        // Create data directory if it doesn't exist
        const dataDir = path.dirname(USERS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Load users
        if (fs.existsSync(USERS_FILE)) {
            global.users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            console.log(`✅ Loaded ${Object.keys(global.users).length} users`);
        } else {
            global.users = {};
            fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
        }

        // Load products
        if (fs.existsSync(PRODUCTS_FILE)) {
            global.products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
            console.log(`✅ Loaded ${Object.keys(global.products).length} products`);
        } else {
            global.products = {};
            fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({}, null, 2));
        }

        // Load orders
        if (fs.existsSync(ORDERS_FILE)) {
            global.orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            console.log(`✅ Loaded ${Object.keys(global.orders).length} orders`);
        } else {
            global.orders = {};
            fs.writeFileSync(ORDERS_FILE, JSON.stringify({}, null, 2));
        }

        // Initialize carts
        global.carts = {};

    } catch (error) {
        console.error('❌ Error loading database:', error);
        // Initialize empty if error
        global.users = {};
        global.products = {};
        global.orders = {};
        global.carts = {};
    }
}

// Save data to JSON files
function saveDatabase(type = 'all') {
    try {
        if (type === 'users' || type === 'all') {
            fs.writeFileSync(USERS_FILE, JSON.stringify(global.users, null, 2));
        }
        if (type === 'products' || type === 'all') {
            fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(global.products, null, 2));
        }
        if (type === 'orders' || type === 'all') {
            fs.writeFileSync(ORDERS_FILE, JSON.stringify(global.orders, null, 2));
        }
        return true;
    } catch (error) {
        console.error('❌ Error saving database:', error);
        return false;
    }
}

// Auto-save interval (every 5 minutes)
setInterval(() => {
    saveDatabase('all');
}, 5 * 60 * 1000);

// Export functions
module.exports = {
    loadDatabase,
    saveDatabase,
    getUsers: () => global.users,
    getProducts: () => global.products,
    getOrders: () => global.orders,
    getCarts: () => global.carts
};
