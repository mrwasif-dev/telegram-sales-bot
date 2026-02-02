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
            
            delete session.step;
            
            const msg = await ctx.reply(
                `✅ *Broadcast Complete!*\n\n` +
                `Message sent to ${users.length} users.\n\n` +
                `✅ Successful: ${successCount}\n` +
                `❌ Failed: ${failCount}\n\n` +
                `Message preview:\n${text.substring(0, 200)}...`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📤 Send Another', 'broadcast_message')],
                        [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle search queries
        else if (session.step === 'awaiting_search_query') {
            const query = text.toLowerCase();
            const products = Object.entries(global.products)
                .filter(([_, product]) => 
                    product.status === 'active' && 
                    product.stock > 0 &&
                    (
                        product.name.toLowerCase().includes(query) ||
                        (product.description && product.description.toLowerCase().includes(query)) ||
                        (product.category && product.category.toLowerCase().includes(query))
                    )
                )
                .slice(0, 20);
            
            delete session.step;
            
            if (products.length === 0) {
                const msg = await ctx.reply(
                    `🔍 *Search Results for "${text}"*\n\n` +
                    `No products found matching your search.\n\n` +
                    `Try different keywords or browse all products.`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🛒 Browse All Products', 'browse_products')],
                            [Markup.button.callback('🔍 Search Again', 'search_products')],
                            [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                        ])
                    }
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            let buttons = [];
            for (const [id, product] of products) {
                buttons.push([
                    Markup.button.callback(
                        `🛒 ${product.name} - $${product.price}`,
                        `view_product_${id}`
                    )
                ]);
            }
            
            buttons.push([
                Markup.button.callback('🔍 New Search', 'search_products'),
                Markup.button.callback('🔙 Back to Products', 'browse_products')
            ]);
            
            const msg = await ctx.reply(
                `🔍 *Search Results for "${text}"*\n\n` +
                `Found ${products.length} matching products:\n\n` +
                `Select a product to view details:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle custom deposit amount
        else if (session.step === 'awaiting_custom_deposit') {
            const amount = parseFloat(text);
            
            if (isNaN(amount) || amount < 1 || amount > 1000) {
                const msg = await ctx.reply(
                    `❌ *Invalid Amount*\n\n` +
                    `Please enter a valid amount between $1 and $1000:\n` +
                    `Example: 50 or 75.50`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('❌ Cancel', 'deposit_funds')]
                        ])
                    }
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            session.step = 'awaiting_deposit_method';
            session.depositAmount = amount;
            
            const msg = await ctx.reply(
                `💵 *Deposit $${amount.toFixed(2)}*\n\n` +
                `Selected amount: *$${amount.toFixed(2)}*\n\n` +
                `Choose payment method:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('💳 Credit Card', 'deposit_card'),
                            Markup.button.callback('📱 Mobile Money', 'deposit_mobile')
                        ],
                        [
                            Markup.button.callback('🏦 Bank Transfer', 'deposit_bank'),
                            Markup.button.callback('🎫 Gift Card', 'deposit_giftcard')
                        ],
                        [Markup.button.callback('🔙 Change Amount', 'deposit_funds')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle withdrawal amount
        else if (session.step === 'awaiting_withdrawal_amount') {
            const amount = parseFloat(text);
            const user = global.users[userId];
            
            if (isNaN(amount) || amount < 10 || amount > user.wallet) {
                const msg = await ctx.reply(
                    `❌ *Invalid Amount*\n\n` +
                    `Please enter a valid amount:\n` +
                    `Minimum: $10\n` +
                    `Maximum: $${user.wallet.toFixed(2)}\n\n` +
                    `Your balance: $${user.wallet.toFixed(2)}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('❌ Cancel', 'withdraw_funds')]
                        ])
                    }
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            session.withdrawalAmount = amount;
            session.step = 'awaiting_withdrawal_details';
            
            const methodName = session.withdrawalMethod === 'bank' ? 'Bank Account' :
                             session.withdrawalMethod === 'mobile' ? 'Mobile Number' :
                             session.withdrawalMethod === 'card' ? 'Card Details' :
                             'PayPal Email';
            
            const msg = await ctx.reply(
                `🏧 *Withdrawal Details*\n\n` +
                `Amount: *$${amount.toFixed(2)}*\n` +
                `Method: ${methodName}\n\n` +
                `Please enter your ${methodName.toLowerCase()}:\n\n` +
                `Example: ${getExampleForMethod(session.withdrawalMethod)}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Cancel', 'withdraw_funds')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle withdrawal details
        else if (session.step === 'awaiting_withdrawal_details') {
            const user = global.users[userId];
            const amount = session.withdrawalAmount;
            const method = session.withdrawalMethod;
            const details = text;
            
            // Deduct from wallet
            user.wallet -= amount;
            
            // Record transaction
            const transactionId = `wdr_${Date.now()}_${userId}`;
            const { date, time } = getCurrentDateTime();
            
            if (!user.transactions) user.transactions = [];
            user.transactions.push({
                id: transactionId,
                type: 'withdrawal',
                amount: amount,
                method: method,
                details: details,
                status: 'pending',
                date: date,
                time: time,
                timestamp: Date.now()
            });
            
            saveDatabase('users');
            
            // Clear session
            delete session.step;
            delete session.withdrawalAmount;
            delete session.withdrawalMethod;
            
            const msg = await ctx.reply(
                `✅ *Withdrawal Request Submitted!*\n\n` +
                `Amount: *$${amount.toFixed(2)}*\n` +
                `Method: ${method}\n` +
                `Details: ${details}\n` +
                `Transaction ID: ${transactionId}\n\n` +
                `💰 *New Wallet Balance: $${user.wallet.toFixed(2)}*\n\n` +
                `Your withdrawal request is being processed.\n` +
                `You will receive the funds within 1-3 business days.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📋 View Transaction', 'transaction_history')],
                        [Markup.button.callback('💰 View Wallet', 'my_wallet')],
                        [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                    ])
                }
            );
            
            // Notify admin
            await bot.telegram.sendMessage(
                ADMIN_ID,
                `🏧 *New Withdrawal Request*\n\n` +
                `User: ${user.name}\n` +
                `Amount: $${amount.toFixed(2)}\n` +
                `Method: ${method}\n` +
                `Details: ${details}\n` +
                `Transaction ID: ${transactionId}\n\n` +
                `User Balance: $${user.wallet.toFixed(2)}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Approve', `approve_withdrawal_${transactionId}`)],
                        [Markup.button.callback('❌ Reject', `reject_withdrawal_${transactionId}`)]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle tracking number for shipping
        else if (session.step && session.step.startsWith('awaiting_tracking_')) {
            const orderId = session.step.replace('awaiting_tracking_', '');
            const order = global.orders[orderId];
            
            if (!order) {
                const msg = await ctx.reply(
                    'Order not found!',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Back to Orders', 'view_orders')]
                    ])
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            // Update order status
            order.status = ORDER_STATUS.SHIPPED;
            order.tracking_number = text;
            order.shipped_at = new Date().toISOString();
            order.updated_at = Date.now();
            
            saveDatabase('orders');
            
            // Notify customer
            await bot.telegram.sendMessage(
                order.user_id,
                `🚚 *Your Order Has Shipped!*\n\n` +
                `Order #${orderId.substring(0, 8)} is now on its way.\n\n` +
                `📦 Tracking Number: ${text}\n\n` +
                `We'll notify you when it's delivered!`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📋 Track Order', `order_details_${orderId}`)]
                    ])
                }
            );
            
            delete session.step;
            
            const msg = await ctx.reply(
                `✅ *Order Shipped!*\n\n` +
                `Order #${orderId.substring(0, 8)} has been marked as shipped.\n\n` +
                `📦 Tracking: ${text}\n\n` +
                `Customer has been notified.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📋 View Order', `order_details_${orderId}`)],
                        [Markup.button.callback('🔙 Back to Orders', 'view_orders')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle support messages
        else if (session.step === 'contacting_support') {
            const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
            
            // Forward to admin
            await bot.telegram.sendMessage(
                ADMIN_ID,
                `🆘 *Support Request*\n\n` +
                `👤 User: ${userName}\n` +
                `🆔 User ID: ${userId}\n\n` +
                `💬 Message:\n${text}\n\n` +
                `Reply options:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback(`📤 Reply to ${userName}`, `reply_to_${userId}`)],
                        [Markup.button.callback('👁️ View Profile', `view_profile_${userId}`)]
                    ])
                }
            );
            
            delete session.step;
            
            const msg = await ctx.reply(
                `✅ *Support Request Sent!*\n\n` +
                `Your message has been sent to our support team.\n\n` +
                `We'll respond as soon as possible.\n\n` +
                `Message preview: ${text.substring(0, 100)}...`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📋 View FAQ', 'view_faq')],
                        [Markup.button.callback('🔙 Back to Help', 'help')]
                    ])
                }
            );
            
            session.lastBotMessage = msg.message_id;
        }
        
        // Handle admin reply to user
        else if (session.step && session.step.startsWith('replying_to_')) {
            const targetUserId = session.step.replace('replying_to_', '');
            const targetUser = global.users[targetUserId];
            
            if (!targetUser) {
                const msg = await ctx.reply(
                    'User not found!',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                    ])
                );
                session.lastBotMessage = msg.message_id;
                return;
            }
            
            // Send message to user
            await bot.telegram.sendMessage(
                targetUserId,
                `📩 *Message from Support*\n\n` +
                `${text}\n\n` +
                `Need more help? Reply to this message.`,
                { parse_mode: 'Markdown' }
            );
            
            delete session.step;
            
            const msg = await ctx.reply(
                `✅ *Reply Sent!*\n\n` +
                `Your message has been sent to ${targetUser.name}.`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('📤 Send Another', `reply_to_${targetUserId}`)],
                    [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                ])
            );
            
            session.lastBotMessage = msg.message_id;
        }
    });
    
    // Helper function for withdrawal examples
    function getExampleForMethod(method) {
        switch (method) {
            case 'bank':
                return 'Bank Name: Account Name - 1234567890';
            case 'mobile':
                return '+1234567890 (Provider: Vodafone)';
            case 'card':
                return 'Card ending in 1234 (Name on card)';
            case 'paypal':
                return 'user@example.com';
            default:
                return 'Account details';
        }
    }
};
