require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🚀 Telegram Sales Bot Starting...');
console.log('📅', new Date().toISOString());

// ===== INITIALIZE GLOBALS =====
global.users = {};
global.products = {};
global.orders = {};
global.carts = {};
global.sessions = {};

// ===== LOAD DATABASE =====
try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const usersFile = path.join(dataDir, 'users.json');
    const productsFile = path.join(dataDir, 'products.json');
    const ordersFile = path.join(dataDir, 'orders.json');
    
    // Load or create users
    if (fs.existsSync(usersFile)) {
        global.users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    } else {
        fs.writeFileSync(usersFile, JSON.stringify({}, null, 2));
    }
    
    // Load or create products
    if (fs.existsSync(productsFile)) {
        global.products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    } else {
        fs.writeFileSync(productsFile, JSON.stringify({}, null, 2));
    }
    
    // Load or create orders
    if (fs.existsSync(ordersFile)) {
        global.orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    } else {
        fs.writeFileSync(ordersFile, JSON.stringify({}, null, 2));
    }
    
    console.log('✅ Database loaded');
    console.log(`👥 Users: ${Object.keys(global.users).length}`);
    console.log(`📦 Products: ${Object.keys(global.products).length}`);
    console.log(`📋 Orders: ${Object.keys(global.orders).length}`);
} catch (error) {
    console.error('❌ Database error:', error);
}

// ===== CREATE BOT =====
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN || '');
console.log('✅ Bot instance created');

// ===== AUTO-LOAD ALL JS FILES =====
function loadAllModules(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`📁 Directory not found: ${dir}`);
        return;
    }
    
    const items = fs.readdirSync(dir);
    let loadedCount = 0;
    
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            // Recursively load subdirectories
            loadAllModules(fullPath);
        } else if (item.endsWith('.js') && item !== 'index.js') {
            try {
                const module = require(fullPath);
                
                if (typeof module === 'function') {
                    module(bot);
                    console.log(`✅ Loaded: ${item}`);
                    loadedCount++;
                } else if (module && typeof module.default === 'function') {
                    module.default(bot);
                    console.log(`✅ Loaded: ${item} (default)`);
                    loadedCount++;
                } else if (module && typeof module.init === 'function') {
                    module.init(bot);
                    console.log(`✅ Loaded: ${item} (init)`);
                    loadedCount++;
                }
            } catch (error) {
                console.error(`❌ Error loading ${item}:`, error.message);
            }
        }
    });
    
    return loadedCount;
}

console.log('📁 Loading modules...');
let totalLoaded = 0;

// Load from different directories
const directories = ['core', 'utils', 'handlers', 'middlewares'];
directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
        totalLoaded += loadAllModules(dirPath);
    }
});

console.log(`✅ Total modules loaded: ${totalLoaded}`);

// ===== DATABASE SAVE FUNCTION =====
global.saveUsers = () => {
    try {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(dataDir, 'users.json'),
            JSON.stringify(global.users, null, 2)
        );
        return true;
    } catch (error) {
        console.error('❌ Save error:', error);
        return false;
    }
};

// ===== BASIC COMMANDS (FALLBACK) =====
// اگر کوئی ہینڈلر نہ لوڈ ہو تو بنیادی کمانڈز
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    console.log(`👋 User started: ${userName} (${userId})`);
    
    // Initialize user
    if (!global.users[userId]) {
        global.users[userId] = {
            id: userId,
            name: userName,
            username: ctx.from.username || '',
            role: userId.toString() === (process.env.ADMIN_ID || '6012422087') ? 'admin' : 'user',
            wallet: 100.00, // Starting balance
            orders_count: 0,
            total_spent: 0,
            registration_date: new Date().toISOString()
        };
        global.saveUsers();
    }
    
    const isAdmin = global.users[userId].role === 'admin';
    
    const { Markup } = require('telegraf');
    
    if (isAdmin) {
        await ctx.reply(
            `🛡️ *Admin Panel*\n\nWelcome ${userName}!\n\n` +
            `Users: ${Object.keys(global.users).length}\n` +
            `Products: ${Object.keys(global.products).length}\n` +
            `Orders: ${Object.keys(global.orders).length}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📦 Manage Products', 'manage_products')],
                    [Markup.button.callback('📋 View Orders', 'view_orders')],
                    [Markup.button.callback('💰 View Wallet', 'my_wallet')],
                    [Markup.button.callback('🆘 Help', 'help')]
                ])
            }
        );
    } else {
        await ctx.reply(
            `🛍️ *Welcome to Our Store!*\n\nHello ${userName}!\n\n` +
            `Your wallet: $${global.users[userId].wallet.toFixed(2)}\n` +
            `Your orders: ${global.users[userId].orders_count}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                    [Markup.button.callback('📦 My Orders', 'my_orders')],
                    [Markup.button.callback('💰 My Wallet', 'my_wallet')],
                    [Markup.button.callback('🆘 Help', 'help')]
                ])
            }
        );
    }
});

// Help command
bot.help(async (ctx) => {
    await ctx.reply(
        '🆘 *Help*\n\n' +
        'Available commands:\n' +
        '/start - Start the bot\n' +
        '/help - Show this message\n' +
        '/menu - Show main menu\n\n' +
        'If buttons dont work, type the commands.',
        { parse_mode: 'Markdown' }
    );
});

// Simple echo for testing
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text && !text.startsWith('/')) {
        await ctx.reply(`You said: ${text}\n\nTry /start or /help`);
    }
});

// ===== ERROR HANDLING =====
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    try {
        ctx.reply('Sorry, an error occurred. Please try /start again.');
    } catch (e) {
        console.error('Cannot send error message');
    }
});

// ===== START BOT IN POLLING MODE =====
(async () => {
    try {
        console.log('🔄 Starting bot in polling mode...');
        
        // Delete webhook first (if any)
        try {
            await bot.telegram.deleteWebhook();
            console.log('✅ Webhook deleted');
        } catch (e) {
            console.log('ℹ️ No webhook to delete');
        }
        
        // Start polling
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        });
        
        console.log('🤖 Bot is running successfully!');
        console.log('📱 Test your bot on Telegram now!');
        console.log('👉 Send /start to your bot');
        console.log('================================');
        
        // Show bot info
        const botInfo = await bot.telegram.getMe();
        console.log(`Bot username: @${botInfo.username}`);
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        console.log('🔧 Trying alternative method...');
        
        // Alternative method
        try {
            bot.startPolling();
            console.log('🤖 Bot started with startPolling()');
        } catch (e) {
            console.error('❌ All methods failed:', e);
            process.exit(1);
        }
    }
})();

// ===== KEEP ALIVE FOR HEROKU =====
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'ok',
        bot: 'Telegram Sales Bot',
        time: new Date().toISOString(),
        users: Object.keys(global.users).length
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Keep-alive server on port ${PORT}`);
});

// ===== GRACEFUL SHUTDOWN =====
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot (SIGINT)...');
    global.saveUsers();
    bot.stop('SIGINT');
    server.close();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot (SIGTERM)...');
    global.saveUsers();
    bot.stop('SIGTERM');
    server.close();
    process.exit(0);
});
