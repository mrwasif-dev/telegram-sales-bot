const { Markup } = require('telegraf');
const { deleteMessage } = require('../utils/messageUtils');
const { ADMIN_ID, USER_ROLES } = require('../core/constants');

module.exports = (bot) => {
    // Help menu
    bot.action('help', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const isAdmin = global.users[userId]?.role === USER_ROLES.ADMIN;
        
        let message = `🆘 *Help & Support*\n\n`;
        
        if (isAdmin) {
            message += `*Admin Commands:*\n`;
            message += `• /admin - Open admin panel\n`;
            message += `• /stats - View sales statistics\n`;
            message += `• /users - Manage users\n`;
            message += `• /products - Manage products\n`;
            message += `• /orders - Manage orders\n`;
            message += `• /broadcast - Send message to all users\n\n`;
        }
        
        message += `*User Commands:*\n`;
        message += `• /start - Start the bot\n`;
        message += `• /menu - Show main menu\n`;
        message += `• /products - Browse products\n`;
        message += `• /cart - View shopping cart\n`;
        message += `• /orders - View your orders\n`;
        message += `• /wallet - Check wallet balance\n`;
        message += `• /help - Show this help message\n\n`;
        
        message += `*Need Assistance?*\n`;
        message += `If you need help with:\n`;
        message += `• Orders or payments\n`;
        message += `• Account issues\n`;
        message += `• Product questions\n`;
        message += `• Technical problems\n\n`;
        
        message += `Please contact our support team.`;
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📞 Contact Support', 'contact_support')],
                    [Markup.button.callback('📋 FAQ', 'view_faq')],
                    [Markup.button.callback('📢 Announcements', 'view_announcements')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Contact support
    bot.action('contact_support', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `📞 *Contact Support*\n\n` +
            `Please describe your issue and we'll help you:\n\n` +
            `1. Order-related issues\n` +
            `2. Payment problems\n` +
            `3. Account issues\n` +
            `4. Product inquiries\n` +
            `5. Other questions\n\n` +
            `Type your message below:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', 'help')]
            ])
        );
        
        global.sessions[userId] = {
            step: 'contacting_support',
            lastBotMessage: msg.message_id
        };
    });

    // FAQ
    bot.action('view_faq', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `📋 *Frequently Asked Questions*\n\n` +
            `*Q: How do I place an order?*\n` +
            `A: Browse products, add to cart, and checkout.\n\n` +
            `*Q: What payment methods are accepted?*\n` +
            `A: Wallet, credit cards, and mobile payments.\n\n` +
            `*Q: How long does shipping take?*\n` +
            `A: 3-7 business days depending on location.\n\n` +
            `*Q: Can I cancel my order?*\n` +
            `A: Yes, if order is still pending.\n\n` +
            `*Q: How do I contact support?*\n` +
            `A: Use the Contact Support button.\n\n` +
            `*Q: Is my payment secure?*\n` +
            `A: Yes, we use secure payment processing.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📞 More Questions?', 'contact_support')],
                    [Markup.button.callback('🔙 Back to Help', 'help')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Announcements
    bot.action('view_announcements', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `📢 *Latest Announcements*\n\n` +
            `*📅 December 2023 Updates*\n` +
            `• New products added weekly\n` +
            `• Faster shipping options available\n` +
            `• Holiday sale coming soon!\n\n` +
            `*🛍️ Special Offers*\n` +
            `• Free shipping on orders over $50\n` +
            `• 10% off for first-time buyers\n` +
            `• Refer friends and earn credits\n\n` +
            `*🔧 System Updates*\n` +
            `• Improved checkout process\n` +
            `• Enhanced wallet features\n` +
            `• Better order tracking`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛒 Shop Now', 'browse_products')],
                    [Markup.button.callback('🔙 Back to Help', 'help')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Profile
    bot.action('profile', async (ctx) => {
        const userId = ctx.from.id;
        const user = global.users[userId];
        
        if (!user) {
            await ctx.answerCbQuery('User not found!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `👤 *Your Profile*\n\n` +
            `Name: ${user.name}\n` +
            `Username: @${user.username || 'Not set'}\n` +
            `User ID: ${userId}\n` +
            `Role: ${user.role}\n` +
            `Joined: ${user.registration_date}\n` +
            `Last Active: ${user.last_active}\n\n` +
            `📊 *Statistics*\n` +
            `Wallet Balance: $${user.wallet.toFixed(2)}\n` +
            `Total Orders: ${user.orders_count}\n` +
            `Total Spent: $${user.total_spent.toFixed(2)}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✏️ Edit Profile', 'edit_profile'),
                        Markup.button.callback('🔒 Security', 'security_settings')
                    ],
                    [Markup.button.callback('🔔 Notifications', 'notification_settings')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Edit profile
    bot.action('edit_profile', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `✏️ *Edit Profile*\n\n` +
            `What would you like to edit?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📝 Change Name', 'change_name')],
                [Markup.button.callback('📱 Change Phone', 'change_phone')],
                [Markup.button.callback('🏠 Change Address', 'change_address')],
                [Markup.button.callback('🔙 Back to Profile', 'profile')]
            ])
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });
};
