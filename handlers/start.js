const { Markup } = require('telegraf');
const { getCurrentDateTime } = require('../utils/dateTime');
const { deleteMessage } = require('../utils/messageUtils');
const { ADMIN_ID, USER_ROLES } = require('../core/constants');
const { saveDatabase } = require('../core/database');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
        
        // Delete the /start message
        if (ctx.message) {
            await deleteMessage(ctx, ctx.message.message_id);
        }

        // Initialize user if not exists
        if (!global.users[userId]) {
            const { date, time } = getCurrentDateTime();
            global.users[userId] = {
                id: userId,
                name: userName,
                username: ctx.from.username || '',
                role: userId === ADMIN_ID ? USER_ROLES.ADMIN : USER_ROLES.USER,
                wallet: 0,
                total_spent: 0,
                orders_count: 0,
                registration_date: date,
                registration_time: time,
                last_active: `${date} ${time}`,
                is_active: true
            };
            saveDatabase('users');
        } else {
            // Update last active
            const { date, time } = getCurrentDateTime();
            global.users[userId].last_active = `${date} ${time}`;
        }

        // Create main menu based on user role
        let message = '';
        let keyboard = [];

        if (global.users[userId].role === USER_ROLES.ADMIN) {
            message = `🛡️ *Admin Panel*\n\n` +
                     `👋 Welcome back, ${userName}!\n` +
                     `📊 Total Users: ${Object.keys(global.users).length}\n` +
                     `📦 Total Products: ${Object.keys(global.products).length}\n` +
                     `💰 Total Sales: $${Object.values(global.orders)
                         .filter(o => o.status === 'delivered')
                         .reduce((sum, order) => sum + order.total_amount, 0)
                         .toFixed(2)}`;
            
            keyboard = [
                [Markup.button.callback('📦 Manage Products', 'manage_products')],
                [Markup.button.callback('📊 View Orders', 'view_orders')],
                [Markup.button.callback('👥 Manage Users', 'manage_users')],
                [Markup.button.callback('📈 Sales Reports', 'sales_reports')],
                [Markup.button.callback('⚙️ Settings', 'admin_settings')]
            ];
        } else {
            message = `🛍️ *Welcome to Our Store!*\n\n` +
                     `👋 Hello ${userName}!\n` +
                     `💰 Wallet Balance: $${global.users[userId].wallet.toFixed(2)}\n` +
                     `📦 Your Orders: ${global.users[userId].orders_count}\n` +
                     `💳 Total Spent: $${global.users[userId].total_spent.toFixed(2)}`;
            
            keyboard = [
                [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                [Markup.button.callback('📦 My Orders', 'my_orders')],
                [Markup.button.callback('💰 My Wallet', 'my_wallet')],
                [Markup.button.callback('🛍️ View Cart', 'view_cart')],
                [Markup.button.callback('🆘 Help', 'help'), Markup.button.callback('⚙️ Profile', 'profile')]
            ];
        }

        const msg = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });

        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Back to main menu
    bot.action('back_to_main', async (ctx) => {
        const userId = ctx.from.id;
        
        if (global.sessions[userId]?.lastBotMessage) {
            await deleteMessage(ctx, global.sessions[userId].lastBotMessage);
        }
        
        await deleteMessage(ctx);
        
        const userName = ctx.from.first_name;
        let message = '';
        let keyboard = [];

        if (global.users[userId].role === USER_ROLES.ADMIN) {
            message = `🛡️ *Admin Panel*\n\n` +
                     `Welcome back, ${userName}!`;
            
            keyboard = [
                [Markup.button.callback('📦 Manage Products', 'manage_products')],
                [Markup.button.callback('📊 View Orders', 'view_orders')],
                [Markup.button.callback('👥 Manage Users', 'manage_users')],
                [Markup.button.callback('📈 Sales Reports', 'sales_reports')],
                [Markup.button.callback('⚙️ Settings', 'admin_settings')]
            ];
        } else {
            message = `🏠 *Main Menu*\n\n` +
                     `Welcome ${userName}!`;
            
            keyboard = [
                [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                [Markup.button.callback('📦 My Orders', 'my_orders')],
                [Markup.button.callback('💰 My Wallet', 'my_wallet')],
                [Markup.button.callback('🛍️ View Cart', 'view_cart')],
                [Markup.button.callback('🆘 Help', 'help'), Markup.button.callback('⚙️ Profile', 'profile')]
            ];
        }

        const msg = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });

        global.sessions[userId] = { lastBotMessage: msg.message_id };
        await ctx.answerCbQuery();
    });
};
