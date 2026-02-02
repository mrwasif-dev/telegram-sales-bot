require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Telegram Sales Bot...');
console.log('📅', new Date().toISOString());

// ===== LOAD CORE MODULES =====
try {
    // Load database first
    require('./core/database').loadDatabase();
    console.log('✅ Database loaded');
} catch (error) {
    console.error('❌ Database loading error:', error.message);
}

try {
    // Load bot instance
    const bot = require('./core/bot');
    console.log('✅ Bot instance created');
} catch (error) {
    console.error('❌ Bot instance error:', error.message);
    process.exit(1);
}

const bot = require('./core/bot');

// ===== AUTO-LOAD HANDLERS =====
function loadHandlers(directory) {
    if (!fs.existsSync(directory)) {
        console.log(`📁 Directory not found: ${directory}`);
        return;
    }
    
    const files = fs.readdirSync(directory, { withFileTypes: true });
    
    files.forEach(file => {
        const fullPath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            loadHandlers(fullPath);
        } else if (file.name.endsWith('.js') && file.name !== 'index.js') {
            try {
                const handler = require(fullPath);
                if (typeof handler === 'function') {
                    handler(bot);
                    console.log(`✅ Loaded: ${file.name}`);
                }
            } catch (error) {
                console.error(`❌ Error loading ${file.name}:`, error.message);
            }
        }
    });
}

// Load all handlers
console.log('📁 Loading handlers...');
loadHandlers('./handlers');

// ===== ERROR HANDLING =====
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    try {
        ctx.reply('❌ An error occurred. Please try again.');
    } catch (e) {
        console.error('Failed to send error message:', e);
    }
});

// ===== START BOT =====
(async () => {
    try {
        await bot.launch();
        console.log('🤖 Bot is running successfully!');
        console.log('📊 Stats:', {
            users: Object.keys(global.users || {}).length,
            products: Object.keys(global.products || {}).length,
            orders: Object.keys(global.orders || {}).length
        });
        console.log('================================');
    } catch (error) {
        console.error('❌ Failed to launch bot:', error);
        process.exit(1);
    }
})();

// ===== GRACEFUL SHUTDOWN =====
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot (SIGINT)...');
    require('./core/database').saveDatabase();
    console.log('💾 Database saved');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot (SIGTERM)...');
    require('./core/database').saveDatabase();
    console.log('💾 Database saved');
    bot.stop('SIGTERM');
    process.exit(0);
});
