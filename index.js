require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'Telegram Sales Bot',
        timestamp: new Date().toISOString(),
        endpoints: ['/', '/health', '/webhook']
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        users: Object.keys(global.users || {}).length,
        products: Object.keys(global.products || {}).length,
        orders: Object.keys(global.orders || {}).length,
        loadedHandlers: Object.keys(global.loadedHandlers || {}).length
    });
});

console.log('🚀 Starting Telegram Sales Bot...');

// ===== INITIALIZE GLOBALS =====
global.users = {};
global.products = {};
global.orders = {};
global.carts = {};
global.sessions = {};
global.loadedHandlers = {};

// ===== LOAD DATABASE =====
try {
    const dbPath = path.join(__dirname, 'data');
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
    }
    
    const usersFile = path.join(dbPath, 'users.json');
    const productsFile = path.join(dbPath, 'products.json');
    const ordersFile = path.join(dbPath, 'orders.json');
    
    // Load users
    if (fs.existsSync(usersFile)) {
        global.users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    } else {
        fs.writeFileSync(usersFile, JSON.stringify({}, null, 2));
    }
    
    // Load products
    if (fs.existsSync(productsFile)) {
        global.products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    } else {
        fs.writeFileSync(productsFile, JSON.stringify({}, null, 2));
    }
    
    // Load orders
    if (fs.existsSync(ordersFile)) {
        global.orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    } else {
        fs.writeFileSync(ordersFile, JSON.stringify({}, null, 2));
    }
    
    console.log('✅ Database loaded:', {
        users: Object.keys(global.users).length,
        products: Object.keys(global.products).length,
        orders: Object.keys(global.orders).length
    });
} catch (error) {
    console.error('❌ Database loading error:', error.message);
}

// ===== CREATE BOT INSTANCE =====
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN || '');
console.log('✅ Bot instance created');

// ===== AUTO-LOAD ALL .JS FILES FROM FOLDERS =====
function scanAndLoadDirectory(dirPath, baseDir = '') {
    if (!fs.existsSync(dirPath)) {
        console.log(`📁 Directory not found: ${dirPath}`);
        return;
    }
    
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    items.forEach(item => {
        const fullPath = path.join(dirPath, item.name);
        const relativePath = path.join(baseDir, item.name);
        
        if (item.isDirectory()) {
            // Recursively scan subdirectories
            scanAndLoadDirectory(fullPath, relativePath);
        } else if (item.name.endsWith('.js') && item.name !== 'index.js') {
            try {
                const module = require(fullPath);
                
                if (typeof module === 'function') {
                    // Pass bot to the module
                    module(bot);
                    global.loadedHandlers[relativePath] = true;
                    console.log(`✅ Loaded: ${relativePath}`);
                } else if (module && typeof module.default === 'function') {
                    // ES6 default export
                    module.default(bot);
                    global.loadedHandlers[relativePath] = true;
                    console.log(`✅ Loaded (default): ${relativePath}`);
                } else if (module && typeof module.init === 'function') {
                    // init() function
                    module.init(bot);
                    global.loadedHandlers[relativePath] = true;
                    console.log(`✅ Loaded (init): ${relativePath}`);
                }
            } catch (error) {
                console.error(`❌ Error loading ${relativePath}:`, error.message);
            }
        }
    });
}

// Load all modules
console.log('📁 Scanning for modules...');

// Scan core directory
scanAndLoadDirectory(path.join(__dirname, 'core'));

// Scan utils directory
scanAndLoadDirectory(path.join(__dirname, 'utils'));

// Scan handlers directory
scanAndLoadDirectory(path.join(__dirname, 'handlers'));

// Scan middlewares directory
scanAndLoadDirectory(path.join(__dirname, 'middlewares'));

console.log(`✅ Total loaded modules: ${Object.keys(global.loadedHandlers).length}`);

// ===== SAVE DATABASE FUNCTION =====
global.saveDatabase = () => {
    try {
        const dbPath = path.join(__dirname, 'data');
        
        fs.writeFileSync(path.join(dbPath, 'users.json'), 
            JSON.stringify(global.users, null, 2));
        fs.writeFileSync(path.join(dbPath, 'products.json'), 
            JSON.stringify(global.products, null, 2));
        fs.writeFileSync(path.join(dbPath, 'orders.json'), 
            JSON.stringify(global.orders, null, 2));
        
        return true;
    } catch (error) {
        console.error('❌ Error saving database:', error);
        return false;
    }
};

// Auto-save every 5 minutes
setInterval(() => {
    global.saveDatabase();
    console.log('💾 Auto-saved database');
}, 5 * 60 * 1000);

// ===== ERROR HANDLING =====
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    try {
        ctx.reply('❌ An error occurred. Please try again or contact support.');
    } catch (e) {
        console.error('Failed to send error message:', e);
    }
});

// ===== START BOT =====
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (WEBHOOK_URL && WEBHOOK_URL.startsWith('https://')) {
    // Webhook mode
    console.log('🌐 Starting in webhook mode...');
    
    app.post('/webhook', (req, res) => {
        bot.handleUpdate(req.body);
        res.sendStatus(200);
    });
    
    (async () => {
        try {
            await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
            console.log(`✅ Webhook set: ${WEBHOOK_URL}/webhook`);
            
            app.listen(PORT, () => {
                console.log(`🌐 Server listening on port ${PORT}`);
                console.log('🤖 Bot ready (Webhook mode)');
            });
        } catch (error) {
            console.error('❌ Webhook error:', error);
            startPolling();
        }
    })();
} else {
    // Polling mode (for Heroku free tier)
    console.log('🔄 Starting in polling mode...');
    startPolling();
}

function startPolling() {
    (async () => {
        try {
            await bot.launch({
                dropPendingUpdates: true,
                allowedUpdates: ['message', 'callback_query']
            });
            
            console.log('🤖 Bot is running (Polling mode)');
            console.log('📊 Current stats:', {
                users: Object.keys(global.users).length,
                products: Object.keys(global.products).length,
                orders: Object.keys(global.orders).length
            });
            
            // Start Express server for health checks
            app.listen(PORT, () => {
                console.log(`🌐 Health check server on port ${PORT}`);
            });
        } catch (error) {
            console.error('❌ Failed to launch bot:', error);
            process.exit(1);
        }
    })();
}

// ===== GRACEFUL SHUTDOWN =====
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
    console.log(`\n🛑 Stopping bot (${signal})...`);
    
    // Save database
    global.saveDatabase();
    console.log('💾 Database saved');
    
    // Stop bot
    bot.stop(signal);
    
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, bot };
