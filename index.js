require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== CREATE EXPRESS APP FOR WEBHOOK (Optional) =====
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Telegram Sales Bot',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            webhook: '/webhook'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        users: Object.keys(global.users || {}).length,
        products: Object.keys(global.products || {}).length,
        orders: Object.keys(global.orders || {}).length
    });
});

// ===== INITIALIZE BOT =====
console.log('🚀 Initializing Telegram Sales Bot...');

// Load core modules first
require('./core/database').loadDatabase();
console.log('✅ Database loaded');

// Load bot instance
const bot = require('./core/bot');
console.log('✅ Bot instance created');

// ===== AUTO-LOAD ALL HANDLERS =====
function loadModules(directory) {
    const files = fs.readdirSync(directory, { withFileTypes: true });
    
    files.forEach(file => {
        const fullPath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            // Recursively load subdirectories
            loadModules(fullPath);
        } else if (file.name.endsWith('.js') && file.name !== 'index.js') {
            try {
                const module = require(fullPath);
                if (typeof module === 'function') {
                    module(bot);
                    console.log(`✅ Loaded: ${file.name}`);
                }
            } catch (error) {
                console.error(`❌ Error loading ${file.name}:`, error.message);
            }
        }
    });
}

// Load all modules
console.log('📁 Loading modules...');

// Load middlewares first
if (fs.existsSync('./middlewares')) {
    console.log('🔗 Loading middlewares...');
    loadModules('./middlewares');
}

// Load utils
if (fs.existsSync('./utils')) {
    console.log('🛠️ Loading utilities...');
    loadModules('./utils');
}

// Load handlers
if (fs.existsSync('./handlers')) {
    console.log('🔄 Loading handlers...');
    loadModules('./handlers');
}

// ===== ERROR HANDLING =====
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    try {
        ctx.reply('❌ An error occurred. Please try again or contact support.');
    } catch (e) {
        console.error('Failed to send error message:', e);
    }
});

// ===== WEBHOOK SETUP (Optional) =====
if (process.env.WEBHOOK_URL) {
    app.post('/webhook', (req, res) => {
        bot.handleUpdate(req.body);
        res.sendStatus(200);
    });
    
    // Set webhook
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook`)
        .then(() => console.log('✅ Webhook set successfully'))
        .catch(err => console.error('❌ Webhook error:', err));
}

// ===== START SERVER AND BOT =====
if (process.env.WEBHOOK_URL) {
    // Start Express server for webhook
    app.listen(PORT, () => {
        console.log(`🌐 Server running on port ${PORT}`);
        console.log(`🤖 Bot is ready (Webhook mode)`);
        console.log(`📊 Stats: ${Object.keys(global.users).length} users, ${Object.keys(global.products).length} products`);
    });
} else {
    // Start bot in polling mode
    bot.launch().then(() => {
        console.log('🤖 Bot is running (Polling mode)');
        console.log(`📊 Stats: ${Object.keys(global.users).length} users, ${Object.keys(global.products).length} products`);
        console.log('================================');
    });
}

// ===== GRACEFUL SHUTDOWN =====
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot (SIGINT)...');
    
    // Save database before exit
    require('./core/database').saveDatabase();
    console.log('💾 Database saved');
    
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot (SIGTERM)...');
    
    // Save database before exit
    require('./core/database').saveDatabase();
    console.log('💾 Database saved');
    
    bot.stop('SIGTERM');
    process.exit(0);
});

// Auto-save on exit
process.on('exit', () => {
    require('./core/database').saveDatabase();
    console.log('💾 Database saved on exit');
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export for testing
module.exports = { bot, app };
