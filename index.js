require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🚀 Telegram Sales Bot - Single Instance');
console.log('📅', new Date().toISOString());

// ===== CHECK FOR OTHER INSTANCES =====
const instanceFile = path.join(__dirname, '.bot_instance');
const currentTime = Date.now();

// اگر instance پہلے سے چل رہا ہو تو exit
if (fs.existsSync(instanceFile)) {
    const instanceTime = parseInt(fs.readFileSync(instanceFile, 'utf8'));
    const timeDiff = currentTime - instanceTime;
    
    // اگر 5 سیکنڈ سے کم پرانا ہو تو دوسرا instance ہے
    if (timeDiff < 5000) {
        console.log('⚠️ Another bot instance detected. Exiting...');
        process.exit(0);
    }
}

// موجودہ instance کا وقت save کریں
fs.writeFileSync(instanceFile, currentTime.toString());

// Cleanup on exit
process.on('exit', () => {
    if (fs.existsSync(instanceFile)) {
        fs.unlinkSync(instanceFile);
    }
});

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
    
    const loadJSON = (file) => {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        fs.writeFileSync(file, JSON.stringify({}, null, 2));
        return {};
    };
    
    global.users = loadJSON(path.join(dataDir, 'users.json'));
    global.products = loadJSON(path.join(dataDir, 'products.json'));
    global.orders = loadJSON(path.join(dataDir, 'orders.json'));
    
    console.log('✅ Database loaded');
} catch (error) {
    console.error('❌ Database error:', error);
}

// ===== CREATE BOT =====
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN || '');
console.log('✅ Bot instance created');

// ===== SINGLE INSTANCE CHECK =====
let isRunning = false;

// ===== LOAD HANDLERS =====
console.log('📁 Loading handlers...');

// Basic start handler (guaranteed to work)
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    console.log(`👋 User: ${userName} (${userId})`);
    
    // Initialize user
    if (!global.users[userId]) {
        global.users[userId] = {
            id: userId,
            name: userName,
            username: ctx.from.username || '',
            role: userId.toString() === (process.env.ADMIN_ID || '') ? 'admin' : 'user',
            wallet: 100.00,
            orders_count: 0,
            total_spent: 0,
            registration_date: new Date().toISOString(),
            last_active: new Date().toISOString()
        };
        
        // Save to file
        try {
            const dataDir = path.join(__dirname, 'data');
            fs.writeFileSync(
                path.join(dataDir, 'users.json'),
                JSON.stringify(global.users, null, 2)
            );
        } catch (e) {
            console.error('Save error:', e);
        }
    }
    
    const { Markup } = require('telegraf');
    const isAdmin = global.users[userId].role === 'admin';
    
    if (isAdmin) {
        await ctx.reply(
            `🛡️ *Admin Panel*\n\nWelcome ${userName}!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📦 Products', 'manage_products')],
                    [Markup.button.callback('📋 Orders', 'view_orders')],
                    [Markup.button.callback('👥 Users', 'manage_users')],
                    [Markup.button.callback('💰 Wallet', 'my_wallet')]
                ])
            }
        );
    } else {
        await ctx.reply(
            `🛍️ *Welcome ${userName}!*\n\nYour wallet: $${global.users[userId].wallet.toFixed(2)}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛒 Shop', 'browse_products')],
                    [Markup.button.callback('📦 Orders', 'my_orders')],
                    [Markup.button.callback('💰 Wallet', 'my_wallet')],
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
        'Commands:\n' +
        '/start - Start bot\n' +
        '/help - This message\n' +
        '/menu - Main menu\n\n' +
        'Click buttons or type commands.',
        { parse_mode: 'Markdown' }
    );
});

// ===== START BOT =====
(async () => {
    try {
        console.log('🔄 Starting bot...');
        
        // Delete any existing webhook
        try {
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('✅ Webhook deleted');
        } catch (e) {
            console.log('ℹ️ No webhook to delete');
        }
        
        // Start polling
        bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        }).then(() => {
            console.log('✅ Bot started successfully!');
            console.log('📱 Go to Telegram and send /start');
            isRunning = true;
        }).catch(err => {
            console.error('❌ Launch error:', err.message);
            process.exit(1);
        });
        
    } catch (error) {
        console.error('❌ Startup error:', error);
        process.exit(1);
    }
})();

// ===== KEEP ALIVE SERVER =====
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'ok',
        bot: 'running',
        instance: 'single',
        time: new Date().toISOString()
    }));
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Keep-alive on port ${process.env.PORT || 3000}`);
});

// ===== GRACEFUL SHUTDOWN =====
process.once('SIGINT', () => {
    console.log('🛑 Stopping...');
    bot.stop('SIGINT');
    server.close();
    if (fs.existsSync(instanceFile)) {
        fs.unlinkSync(instanceFile);
    }
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping...');
    bot.stop('SIGTERM');
    server.close();
    if (fs.existsSync(instanceFile)) {
        fs.unlinkSync(instanceFile);
    }
    process.exit(0);
});
