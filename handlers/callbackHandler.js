const { Markup } = require('telegraf');
const { deleteMessage, formatPrice } = require('../utils/messageUtils');
const { getCurrentDateTime } = require('../utils/dateTime');
const { saveDatabase } = require('../core/database');
const { ORDER_STATUS, ADMIN_ID, USER_ROLES } = require('../core/constants');
const paymentUtils = require('../utils/paymentUtils');

module.exports = (bot) => {
    // Handle all text messages for various steps
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const session = global.sessions[userId];
        
        if (!session) return;
        
        // Delete user's message
        if (ctx.message) {
            await deleteMessage(ctx, ctx.message.message_id);
        }
        
        // Delete previous bot message if exists
        if (session.lastBotMessage) {
            await deleteMessage(ctx, session.lastBotMessage);
        }
        
        // Handle product creation (admin)
        if (session.step === 'awaiting_product_name') {
            session.productName = text;
            session.step = 'awaiting_product_description';
            
            const msg = await ctx.reply(
                `📝 *Product Description*\n\n` +
                `Product Name: ${text}\n\n` +
                `Now please enter the product description:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Cancel', 'manage_products')]
                    ])
                }
            );
            session.lastBotMessage = msg.message_id;
        }
        else if (session.step === 'awaiting_product_description') {
            session.productDescription = text;
            session.step = 'awaiting_product_price';
            
            const msg = await ctx.reply(
                `💰 *Product Price*\n\n` +
                `Name: ${session.productName}\n` +
                `Description: ${text.substring(0, 100)}...\n\n` +
                `Now please enter the product price (USD):\n` +
                `Example: 19.99`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Cancel', 'manage_products')]
                    ])
                }
            );
            session.lastBotMessage = msg.message_id;
        }
        else if (session.step === 'awaiting_product_price') {
            const price = parseFloat(text);
            
            if (isNaN(price) || price <= 0) {
                const msg = await ctx.reply(
                    `❌ *Invalid Price*\n\n` +
                    `Please enter a valid price number (greater than 0):\n` +
                    `Example: 19.99 or 50`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('❌ Cancel', 'manage_products')]
                        ])
                    }
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            session.productPrice = price;
            session.step = 'awaiting_product_stock';
            
            const msg = await ctx.reply(
                `📦 *Product Stock*\n\n` +
                `Name: ${session.productName}\n` +
                `Price: $${price.toFixed(2)}\n\n` +
                `Now please enter the available stock quantity:\n` +
                `Example: 100`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Cancel', 'manage_products')]
                    ])
                }
            );
            session.lastBotMessage = msg.message_id;
        }
        else if (session.step === 'awaiting_product_stock') {
            const stock = parseInt(text);
            
            if (isNaN(stock) || stock < 0) {
                const msg = await ctx.reply(
                    `❌ *Invalid Stock*\n\n` +
                    `Please enter a valid stock quantity (0 or more):\n` +
                    `Example: 100`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('❌ Cancel', 'manage_products')]
                        ])
                    }
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            session.productStock = stock;
            session.step = 'awaiting_product_category';
            
            const msg = await ctx.reply(
                `📁 *Product Category*\n\n` +
                `Name: ${session.productName}\n` +
                `Price: $${session.productPrice.toFixed(2)}\n` +
                `Stock: ${stock}\n\n` +
                `Now please enter the product category:\n` +
                `Example: Electronics, Clothing, Books, etc.\n\n` +
                `Or type "skip" to leave empty.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Cancel', 'manage_products')]
                    ])
                }
            );
            session.lastBotMessage = msg.message_id;
        }
        else if (session.step === 'awaiting_product_category') {
            const category = text.toLowerCase() === 'skip' ? '' : text;
            
            // Create product ID
            const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const { date, time } = getCurrentDateTime();
            
            // Save product
            global.products[productId] = {
                id: productId,
                name: session.productName,
                description: session.productDescription,
                price: session.productPrice,
                stock: session.productStock,
                category: category,
                status: 'active',
                created_at: Date.now(),
                updated_at: Date.now(),
                created_by: userId,
                created_date: date,
                created_time: time
            };
            
            saveDatabase('products');
            
            // Clear session
            delete session.step;
            delete session.productName;
            delete session.productDescription;
            delete session.productPrice;
            delete session.productStock;
            
            const msg = await ctx.reply(
                `✅ *Product Created Successfully!*\n\n` +
                `Name: ${global.products[productId].name}\n` +
                `Price: $${global.products[productId].price.toFixed(2)}\n` +
                `Stock: ${global.products[productId].stock}\n` +
                `Category: ${global.products[productId].category || 'None'}\n` +
                `ID: ${productId}\n\n` +
                `Product is now live in the store!`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('👀 View Product', `view_product_${productId}`)],
                        [Markup.button.callback('📦 Manage Products', 'manage_products')],
                        [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle broadcast messages (admin)
        else if (session.step === 'awaiting_broadcast') {
            const users = Object.keys(global.users);
            let successCount = 0;
            let failCount = 0;
            
            const progressMsg = await ctx.reply(`📤 Sending broadcast to ${users.length} users...`);
            
            for (const user_id of users) {
                try {
                    await bot.telegram.sendMessage(
                        user_id,
                        `📢 *Broadcast Message from Admin*\n\n${text}`,
                        { parse_mode: 'Markdown' }
                    );
                    successCount++;
                } catch (error) {
                    failCount++;
                }
                
                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            await ctx.deleteMessage(progressMsg.message_id);
            
