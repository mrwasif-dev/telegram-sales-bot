const { Markup } = require('telegraf');
const { ADMIN_ID, USER_ROLES } = require('../core/constants');
const { getCurrentDateTime } = require('../utils/dateTime');
const { deleteMessage, formatPrice } = require('../utils/messageUtils');
const { saveDatabase } = require('../core/database');

module.exports = (bot) => {
    // Admin panel actions
    bot.action('manage_products', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const totalProducts = Object.keys(global.products).length;
        const activeProducts = Object.values(global.products).filter(p => p.status === 'active').length;
        
        const msg = await ctx.reply(
            `📦 *Product Management*\n\n` +
            `Total Products: ${totalProducts}\n` +
            `Active Products: ${activeProducts}\n` +
            `Out of Stock: ${totalProducts - activeProducts}\n\n` +
            `Choose an action:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add New Product', 'add_product')],
                    [Markup.button.callback('📝 Edit Products', 'edit_products')],
                    [Markup.button.callback('📊 View All Products', 'view_all_products_admin')],
                    [Markup.button.callback('🔙 Back to Admin Panel', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // Add product
    bot.action('add_product', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        global.sessions[adminId] = {
            step: 'awaiting_product_name',
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `➕ *Add New Product*\n\n` +
            `Please enter the product name:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'manage_products')]
                ])
            }
        );
        
        global.sessions[adminId].lastBotMessage = msg.message_id;
    });

    // Edit products
    bot.action('edit_products', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const products = Object.entries(global.products);
        
        if (products.length === 0) {
            const msg = await ctx.reply(
                'No products found. Add some products first!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Product', 'add_product')],
                    [Markup.button.callback('🔙 Back', 'manage_products')]
                ])
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        let buttons = [];
        for (const [id, product] of products.slice(0, 20)) {
            buttons.push([
                Markup.button.callback(
                    `✏️ ${product.name.substring(0, 20)}...`,
                    `edit_product_${id}`
                )
            ]);
        }
        
        buttons.push([Markup.button.callback('🔙 Back', 'manage_products')]);
        
        const msg = await ctx.reply(
            `📝 *Edit Products*\n\n` +
            `Select a product to edit:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // View all products (admin)
    bot.action('view_all_products_admin', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const products = Object.entries(global.products);
        
        if (products.length === 0) {
            const msg = await ctx.reply(
                'No products found.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Product', 'add_product')],
                    [Markup.button.callback('🔙 Back', 'manage_products')]
                ])
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        let message = `📊 *All Products*\n\n`;
        let count = 0;
        
        for (const [id, product] of products) {
            count++;
            message += `*${count}. ${product.name}*\n`;
            message += `   Price: $${product.price}\n`;
            message += `   Stock: ${product.stock}\n`;
            message += `   Status: ${product.status}\n`;
            message += `   ID: ${id}\n\n`;
            
            if (message.length > 3000) {
                await ctx.reply(message, { parse_mode: 'Markdown' });
                message = '';
            }
        }
        
        if (message.length > 0) {
            const msg = await ctx.reply(
                message,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📝 Edit Products', 'edit_products')],
                        [Markup.button.callback('🔙 Back', 'manage_products')]
                    ])
                }
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
        }
    });

    // Manage users
    bot.action('manage_users', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const totalUsers = Object.keys(global.users).length;
        const activeUsers = Object.values(global.users).filter(u => u.is_active).length;
        const totalBalance = Object.values(global.users)
            .reduce((sum, user) => sum + user.wallet, 0);
        
        const msg = await ctx.reply(
            `👥 *User Management*\n\n` +
            `Total Users: ${totalUsers}\n` +
            `Active Users: ${activeUsers}\n` +
            `Total Wallet Balance: $${totalBalance.toFixed(2)}\n\n` +
            `Choose an action:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View All Users', 'view_all_users')],
                    [Markup.button.callback('📊 User Statistics', 'user_stats')],
                    [Markup.button.callback('📤 Broadcast Message', 'broadcast_message')],
                    [Markup.button.callback('🔙 Back to Admin Panel', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // View all users
    bot.action('view_all_users', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const users = Object.entries(global.users);
        
        if (users.length === 0) {
            const msg = await ctx.reply(
                'No users found.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'manage_users')]
                ])
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        let message = `👥 *All Users*\n\n`;
        let count = 0;
        
        for (const [id, user] of users) {
            count++;
            message += `*${count}. ${user.name}*\n`;
            message += `   Username: @${user.username || 'N/A'}\n`;
            message += `   Role: ${user.role}\n`;
            message += `   Wallet: $${user.wallet.toFixed(2)}\n`;
            message += `   Orders: ${user.orders_count}\n`;
            message += `   Joined: ${user.registration_date}\n`;
            message += `   ID: ${id}\n\n`;
            
            if (message.length > 3000) {
                await ctx.reply(message, { parse_mode: 'Markdown' });
                message = '';
            }
        }
        
        if (message.length > 0) {
            const msg = await ctx.reply(
                message,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📊 User Stats', 'user_stats')],
                        [Markup.button.callback('🔙 Back', 'manage_users')]
                    ])
                }
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
        }
    });

    // User statistics
    bot.action('user_stats', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const totalUsers = Object.keys(global.users).length;
        const activeUsers = Object.values(global.users).filter(u => u.is_active).length;
        const admins = Object.values(global.users).filter(u => u.role === USER_ROLES.ADMIN).length;
        const totalBalance = Object.values(global.users)
            .reduce((sum, user) => sum + user.wallet, 0);
        const totalSpent = Object.values(global.users)
            .reduce((sum, user) => sum + user.total_spent, 0);
        const totalOrders = Object.values(global.users)
            .reduce((sum, user) => sum + user.orders_count, 0);
        
        const msg = await ctx.reply(
            `📊 *User Statistics*\n\n` +
            `👥 Total Users: ${totalUsers}\n` +
            `🟢 Active Users: ${activeUsers}\n` +
            `🛡️ Admins: ${admins}\n` +
            `💰 Total Wallet Balance: $${totalBalance.toFixed(2)}\n` +
            `💳 Total Spent: $${totalSpent.toFixed(2)}\n` +
            `📦 Total Orders: ${totalOrders}\n\n` +
            `📅 Date: ${getCurrentDateTime().date}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View All Users', 'view_all_users')],
                    [Markup.button.callback('🔙 Back', 'manage_users')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // Broadcast message
    bot.action('broadcast_message', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        global.sessions[adminId] = {
            step: 'awaiting_broadcast',
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `📤 *Broadcast Message*\n\n` +
            `Please enter the message to broadcast to all users:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'manage_users')]
                ])
            }
        );
        
        global.sessions[adminId].lastBotMessage = msg.message_id;
    });

    // Sales reports
    bot.action('sales_reports', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const deliveredOrders = Object.values(global.orders)
            .filter(o => o.status === 'delivered');
        
        const totalSales = deliveredOrders.reduce((sum, order) => sum + order.total_amount, 0);
        const totalOrders = deliveredOrders.length;
        const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
        
        // Calculate daily sales (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentOrders = deliveredOrders.filter(order => {
            const orderDate = new Date(order.created_at);
            return orderDate >= sevenDaysAgo;
        });
        
        const recentSales = recentOrders.reduce((sum, order) => sum + order.total_amount, 0);
        
        const msg = await ctx.reply(
            `📈 *Sales Reports*\n\n` +
            `💰 Total Sales: $${totalSales.toFixed(2)}\n` +
            `📦 Total Orders: ${totalOrders}\n` +
            `📊 Average Order Value: $${avgOrderValue.toFixed(2)}\n` +
            `📅 Recent Sales (7 days): $${recentSales.toFixed(2)}\n\n` +
            `Choose report type:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📅 Daily Report', 'daily_report')],
                    [Markup.button.callback('📊 Monthly Report', 'monthly_report')],
                    [Markup.button.callback('📦 Product Performance', 'product_performance')],
                    [Markup.button.callback('🔙 Back to Admin Panel', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // Admin settings
    bot.action('admin_settings', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `⚙️ *Admin Settings*\n\n` +
            `Configure bot settings and preferences:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔧 System Settings', 'system_settings')],
                    [Markup.button.callback('💳 Payment Settings', 'payment_settings')],
                    [Markup.button.callback('📱 Notification Settings', 'notification_settings')],
                    [Markup.button.callback('🔙 Back to Admin Panel', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });
};
