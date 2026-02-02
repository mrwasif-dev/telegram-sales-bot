const { Markup } = require('telegraf');
const { deleteMessage, formatPrice } = require('../utils/messageUtils');
const { getCurrentDateTime } = require('../utils/dateTime');
const { saveDatabase } = require('../core/database');
const { ORDER_STATUS, ADMIN_ID, USER_ROLES } = require('../core/constants');

module.exports = (bot) => {
    // My orders
    bot.action('my_orders', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const userOrders = Object.entries(global.orders)
            .filter(([_, order]) => order.user_id === userId)
            .sort((a, b) => b[1].created_at - a[1].created_at)
            .slice(0, 20);
        
        if (userOrders.length === 0) {
            const msg = await ctx.reply(
                '📭 *No Orders Yet*\n\n' +
                'You haven\'t placed any orders yet.\n' +
                'Start shopping to see your orders here!',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                        [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                    ])
                }
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        let message = `📦 *Your Orders*\n\n`;
        
        userOrders.forEach(([orderId, order], index) => {
            const date = new Date(order.created_at).toLocaleDateString();
            message += `*${index + 1}. Order #${orderId.substring(0, 8)}*\n`;
            message += `   📅 Date: ${date}\n`;
            message += `   💰 Total: $${order.total_amount.toFixed(2)}\n`;
            message += `   📍 Status: ${getStatusEmoji(order.status)} ${order.status}\n`;
            message += `   📋 Items: ${order.items.length}\n\n`;
        });
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('📋 All Orders', 'view_all_orders'),
                        Markup.button.callback('⏳ Pending', 'view_pending_orders')
                    ],
                    [
                        Markup.button.callback('🚚 Processing', 'view_processing_orders'),
                        Markup.button.callback('✅ Delivered', 'view_delivered_orders')
                    ],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // View all orders (admin)
    bot.action('view_orders', async (ctx) => {
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const allOrders = Object.entries(global.orders)
            .sort((a, b) => b[1].created_at - a[1].created_at)
            .slice(0, 20);
        
        if (allOrders.length === 0) {
            const msg = await ctx.reply(
                'No orders found.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                ])
            );
            global.sessions[adminId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        let message = `📊 *All Orders*\n\n`;
        let totalAmount = 0;
        
        allOrders.forEach(([orderId, order], index) => {
            const date = new Date(order.created_at).toLocaleDateString();
            const userName = global.users[order.user_id]?.name || 'Unknown User';
            totalAmount += order.total_amount;
            
            message += `*${index + 1}. Order #${orderId.substring(0, 8)}*\n`;
            message += `   👤 Customer: ${userName}\n`;
            message += `   📅 Date: ${date}\n`;
            message += `   💰 Amount: $${order.total_amount.toFixed(2)}\n`;
            message += `   📍 Status: ${getStatusEmoji(order.status)} ${order.status}\n\n`;
        });
        
        message += `\n📈 *Summary*\n`;
        message += `Total Orders: ${allOrders.length}\n`;
        message += `Total Revenue: $${totalAmount.toFixed(2)}\n`;
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('⏳ Pending', 'admin_pending_orders'),
                        Markup.button.callback('🚚 Processing', 'admin_processing_orders')
                    ],
                    [
                        Markup.button.callback('✅ Delivered', 'admin_delivered_orders'),
                        Markup.button.callback('❌ Cancelled', 'admin_cancelled_orders')
                    ],
                    [Markup.button.callback('📊 Statistics', 'order_statistics')],
                    [Markup.button.callback('🔙 Back to Admin', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // Order details
    bot.action(/^order_details_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const order = global.orders[orderId];
        
        if (!order) {
            const msg = await ctx.reply(
                'Order not found!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Orders', 'my_orders')]
                ])
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        // Check if user is authorized to view this order
        const isAdmin = global.users[userId]?.role === USER_ROLES.ADMIN;
        if (order.user_id !== userId && !isAdmin) {
            const msg = await ctx.reply(
                'You are not authorized to view this order!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Orders', 'my_orders')]
                ])
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        const orderDate = new Date(order.created_at).toLocaleString();
        const customerName = global.users[order.user_id]?.name || 'Unknown';
        
        let message = `📋 *Order Details*\n\n`;
        message += `Order ID: ${orderId}\n`;
        message += `Customer: ${customerName}\n`;
        message += `Date: ${orderDate}\n`;
        message += `Status: ${getStatusEmoji(order.status)} ${order.status}\n`;
        message += `Payment Method: ${order.payment_method}\n`;
        message += `Shipping Address: ${order.shipping_address || 'Not specified'}\n\n`;
        
        message += `📦 *Items*\n`;
        order.items.forEach((item, index) => {
            message += `${index + 1}. ${item.name}\n`;
            message += `   Quantity: ${item.quantity}\n`;
            message += `   Price: $${item.price} each\n`;
            message += `   Subtotal: $${(item.price * item.quantity).toFixed(2)}\n\n`;
        });
        
        message += `💰 *Summary*\n`;
        message += `Subtotal: $${order.subtotal.toFixed(2)}\n`;
        message += `Shipping: $${order.shipping_fee.toFixed(2)}\n`;
        message += `Tax: $${order.tax.toFixed(2)}\n`;
        message += `*Total: $${order.total_amount.toFixed(2)}*\n\n`;
        
        const buttons = [];
        
        if (isAdmin) {
            // Admin actions
            if (order.status === ORDER_STATUS.PENDING) {
                buttons.push([
                    Markup.button.callback('✅ Process Order', `process_order_${orderId}`),
                    Markup.button.callback('❌ Cancel Order', `cancel_order_${orderId}`)
                ]);
            } else if (order.status === ORDER_STATUS.PROCESSING) {
                buttons.push([
                    Markup.button.callback('🚚 Mark as Shipped', `ship_order_${orderId}`)
                ]);
            } else if (order.status === ORDER_STATUS.SHIPPED) {
                buttons.push([
                    Markup.button.callback('✅ Mark as Delivered', `deliver_order_${orderId}`)
                ]);
            }
            
            buttons.push([
                Markup.button.callback('📤 Contact Customer', `contact_customer_${order.user_id}`),
                Markup.button.callback('📊 Update Status', `update_status_${orderId}`)
            ]);
        } else {
            // User actions
            if (order.status === ORDER_STATUS.PENDING) {
                buttons.push([
                    Markup.button.callback('❌ Cancel Order', `cancel_order_${orderId}`)
                ]);
            }
            
            if (order.status === ORDER_STATUS.SHIPPED) {
                buttons.push([
                    Markup.button.callback('✅ Confirm Delivery', `confirm_delivery_${orderId}`)
                ]);
            }
        }
        
        buttons.push([
            Markup.button.callback('🖨️ Print Invoice', `invoice_${orderId}`),
            Markup.button.callback('📞 Contact Support', 'contact_support')
        ]);
        
        buttons.push([
            isAdmin 
                ? Markup.button.callback('🔙 Back to Orders', 'view_orders')
                : Markup.button.callback('🔙 Back to Orders', 'my_orders')
        ]);
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Process order (admin)
    bot.action(/^process_order_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        const order = global.orders[orderId];
        
        if (!order) {
            await ctx.answerCbQuery('Order not found!');
            return;
        }
        
        if (order.status !== ORDER_STATUS.PENDING) {
            await ctx.answerCbQuery(`Order is already ${order.status}!`);
            return;
        }
        
        // Update order status
        order.status = ORDER_STATUS.PROCESSING;
        order.updated_at = Date.now();
        order.processed_by = adminId;
        order.processed_at = new Date().toISOString();
        
        saveDatabase('orders');
        
        // Notify customer
        await bot.telegram.sendMessage(
            order.user_id,
            `🔄 *Order Update*\n\n` +
            `Your order #${orderId.substring(0, 8)} is now being processed.\n` +
            `We'll notify you when it ships!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View Order', `order_details_${orderId}`)]
                ])
            }
        );
        
        await ctx.answerCbQuery('Order marked as processing!');
        
        // Update the order details view
        await deleteMessage(ctx);
        
        const orderDate = new Date(order.created_at).toLocaleString();
        const customerName = global.users[order.user_id]?.name || 'Unknown';
        
        let message = `📋 *Order Details*\n\n`;
        message += `Order ID: ${orderId}\n`;
        message += `Customer: ${customerName}\n`;
        message += `Date: ${orderDate}\n`;
        message += `Status: ${getStatusEmoji(order.status)} ${order.status}\n`;
        message += `Processed by: You\n`;
        message += `Processed at: ${new Date().toLocaleString()}\n\n`;
        
        message += `✅ *Order is now being processed*\n`;
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🚚 Mark as Shipped', `ship_order_${orderId}`),
                        Markup.button.callback('📤 Contact Customer', `contact_customer_${order.user_id}`)
                    ],
                    [Markup.button.callback('🔙 Back to Orders', 'view_orders')]
                ])
            }
        );
        
        global.sessions[adminId] = { lastBotMessage: msg.message_id };
    });

    // Ship order (admin)
    bot.action(/^ship_order_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const adminId = ctx.from.id;
        
        if (global.users[adminId]?.role !== USER_ROLES.ADMIN) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        await deleteMessage(ctx);
        
        global.sessions[adminId] = {
            step: `awaiting_tracking_${orderId}`,
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `🚚 *Ship Order*\n\n` +
            `Please enter tracking number for order #${orderId.substring(0, 8)}:\n\n` +
            `Format: Courier Name - Tracking Number\n` +
            `Example: DHL - 1234567890`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', `order_details_${orderId}`)]
                ])
            }
        );
        
        global.sessions[adminId].lastBotMessage = msg.message_id;
    });

    // Cancel order
    bot.action(/^cancel_order_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const userId = ctx.from.id;
        
        const order = global.orders[orderId];
        
        if (!order) {
            await ctx.answerCbQuery('Order not found!');
            return;
        }
        
        // Check authorization
        const isAdmin = global.users[userId]?.role === USER_ROLES.ADMIN;
        if (order.user_id !== userId && !isAdmin) {
            await ctx.answerCbQuery('❌ Unauthorized!');
            return;
        }
        
        // Check if order can be cancelled
        if (order.status !== ORDER_STATUS.PENDING && order.status !== ORDER_STATUS.PROCESSING) {
            await ctx.answerCbQuery(`Cannot cancel order in ${order.status} status!`);
            return;
        }
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `❌ *Cancel Order*\n\n` +
            `Are you sure you want to cancel order #${orderId.substring(0, 8)}?\n\n` +
            `This action cannot be undone!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Yes, Cancel', `confirm_cancel_${orderId}`),
                        Markup.button.callback('❌ No, Keep', `order_details_${orderId}`)
                    ]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Confirm cancel order
    bot.action(/^confirm_cancel_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const userId = ctx.from.id;
        
        const order = global.orders[orderId];
        
        if (!order) {
            await ctx.answerCbQuery('Order not found!');
            return;
        }
        
        // Update order status
        order.status = ORDER_STATUS.CANCELLED;
        order.updated_at = Date.now();
        order.cancelled_by = userId;
        order.cancelled_at = new Date().toISOString();
        order.cancellation_reason = 'User requested cancellation';
        
        saveDatabase('orders');
        
        // Refund to wallet if paid with wallet
        if (order.payment_method === 'wallet') {
            const user = global.users[order.user_id];
            if (user) {
                user.wallet += order.total_amount;
                saveDatabase('users');
                
                // Notify user of refund
                await bot.telegram.sendMessage(
                    order.user_id,
                    `💰 *Refund Issued*\n\n` +
                    `Order #${orderId.substring(0, 8)} has been cancelled.\n` +
                    `$${order.total_amount.toFixed(2)} has been refunded to your wallet.\n\n` +
                    `New wallet balance: $${user.wallet.toFixed(2)}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('💰 Check Wallet', 'my_wallet')]
                        ])
                    }
                );
            }
        }
        
        // Restock items
        for (const item of order.items) {
            const product = global.products[item.id];
            if (product) {
                product.stock += item.quantity;
            }
        }
        saveDatabase('products');
        
        await ctx.answerCbQuery('Order cancelled successfully!');
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `❌ *Order Cancelled*\n\n` +
            `Order #${orderId.substring(0, 8)} has been cancelled.\n` +
            `Items have been restocked and refund issued if applicable.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('📋 View Order', `order_details_${orderId}`),
                        Markup.button.callback('🔙 Back to Orders', 'my_orders')
                    ]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Helper function for status emoji
    function getStatusEmoji(status) {
        switch (status) {
            case ORDER_STATUS.PENDING: return '⏳';
            case ORDER_STATUS.PROCESSING: return '🔄';
            case ORDER_STATUS.SHIPPED: return '🚚';
            case ORDER_STATUS.DELIVERED: return '✅';
            case ORDER_STATUS.CANCELLED: return '❌';
            default: return '📋';
        }
    }
};
