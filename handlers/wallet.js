const { Markup } = require('telegraf');
const { deleteMessage, formatPrice } = require('../utils/messageUtils');
const { getCurrentDateTime } = require('../utils/dateTime');
const { saveDatabase } = require('../core/database');
const paymentUtils = require('../utils/paymentUtils');
const { ADMIN_ID, USER_ROLES } = require('../core/constants');

module.exports = (bot) => {
    // My wallet
    bot.action('my_wallet', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const user = global.users[userId];
        if (!user) {
            const msg = await ctx.reply(
                'User not found! Please start the bot with /start',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🚀 Start', 'back_to_main')]
                ])
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        // Calculate recent transactions
        const userOrders = Object.values(global.orders)
            .filter(order => order.user_id === userId)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 5);
        
        let message = `💰 *My Wallet*\n\n`;
        message += `Balance: *$${user.wallet.toFixed(2)}*\n`;
        message += `Total Spent: $${user.total_spent.toFixed(2)}\n`;
        message += `Total Orders: ${user.orders_count}\n\n`;
        
        if (userOrders.length > 0) {
            message += `📋 *Recent Transactions*\n`;
            userOrders.forEach((order, index) => {
                const date = new Date(order.created_at).toLocaleDateString();
                message += `${index + 1}. Order #${order.id?.substring(0, 8) || 'N/A'}\n`;
                message += `   Amount: $${order.total_amount.toFixed(2)}\n`;
                message += `   Date: ${date}\n\n`;
            });
        }
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('💵 Deposit', 'deposit_funds'),
                        Markup.button.callback('🏧 Withdraw', 'withdraw_funds')
                    ],
                    [
                        Markup.button.callback('📋 Transaction History', 'transaction_history'),
                        Markup.button.callback('🔄 Refresh', 'my_wallet')
                    ],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Deposit funds
    bot.action('deposit_funds', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `💵 *Deposit Funds*\n\n` +
            `Choose deposit amount or enter custom amount:\n\n` +
            `Quick amounts:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('$10', 'deposit_10'),
                        Markup.button.callback('$25', 'deposit_25'),
                        Markup.button.callback('$50', 'deposit_50')
                    ],
                    [
                        Markup.button.callback('$100', 'deposit_100'),
                        Markup.button.callback('$250', 'deposit_250'),
                        Markup.button.callback('$500', 'deposit_500')
                    ],
                    [Markup.button.callback('🔢 Custom Amount', 'custom_deposit')],
                    [Markup.button.callback('🔙 Back to Wallet', 'my_wallet')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Quick deposit amounts
    bot.action(/^deposit_(\d+)$/, async (ctx) => {
        const amount = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        global.sessions[userId] = {
            step: 'awaiting_deposit_method',
            depositAmount: amount,
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `💵 *Deposit $${amount}*\n\n` +
            `Selected amount: *$${amount}*\n\n` +
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
        
        global.sessions[userId].lastBotMessage = msg.message_id;
    });

    // Custom deposit
    bot.action('custom_deposit', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        global.sessions[userId] = {
            step: 'awaiting_custom_deposit',
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `🔢 *Custom Deposit Amount*\n\n` +
            `Please enter the amount you want to deposit:\n\n` +
            `Minimum: $1\n` +
            `Maximum: $1000\n\n` +
            `Enter amount in USD:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'deposit_funds')]
                ])
            }
        );
        
        global.sessions[userId].lastBotMessage = msg.message_id;
    });

    // Deposit with card
    bot.action('deposit_card', async (ctx) => {
        const userId = ctx.from.id;
        const session = global.sessions[userId];
        
        if (!session || !session.depositAmount) {
            await ctx.answerCbQuery('Please select an amount first!');
            return;
        }
        
        const amount = session.depositAmount;
        
        await deleteMessage(ctx);
        
        // Create payment intent
        const payment = await paymentUtils.createPaymentIntent(amount, 'usd', {
            user_id: userId,
            type: 'deposit'
        });
        
        if (!payment) {
            const msg = await ctx.reply(
                `❌ *Payment Error*\n\n` +
                `Unable to create payment. Please try another method.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Try Again', 'deposit_funds')]
                    ])
                }
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        // For testing, we'll simulate successful payment
        const testPaymentLink = paymentUtils.generateTestPaymentLink(amount, 'Wallet Deposit');
        
        const msg = await ctx.reply(
            `💳 *Card Payment*\n\n` +
            `Amount: *$${amount}*\n\n` +
            `Please complete the payment using the link below:\n\n` +
            `${testPaymentLink}\n\n` +
            `After payment, your wallet will be credited automatically.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ I have Paid', `confirm_payment_${amount}`)],
                    [Markup.button.callback('❌ Cancel Payment', 'deposit_funds')]
                ])
            }
        );
        
        global.sessions[userId] = { 
            lastBotMessage: msg.message_id,
            paymentId: payment.id,
            depositAmount: amount
        };
    });

    // Confirm payment
    bot.action(/^confirm_payment_(\d+)$/, async (ctx) => {
        const amount = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        // Verify payment (simulated for testing)
        const paymentVerified = await paymentUtils.verifyPayment(`test_${Date.now()}`);
        
        if (!paymentVerified) {
            await ctx.answerCbQuery('Payment not verified! Please contact support.');
            return;
        }
        
        // Credit user's wallet
        const user = global.users[userId];
        user.wallet += amount;
        
        // Record transaction
        const transactionId = `txn_${Date.now()}_${userId}`;
        const { date, time } = getCurrentDateTime();
        
        if (!user.transactions) user.transactions = [];
        user.transactions.push({
            id: transactionId,
            type: 'deposit',
            amount: amount,
            method: 'card',
            status: 'completed',
            date: date,
            time: time,
            timestamp: Date.now()
        });
        
        saveDatabase('users');
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            `✅ *Payment Successful!*\n\n` +
            `Amount: *$${amount}*\n` +
            `Transaction ID: ${transactionId}\n\n` +
            `💰 *New Wallet Balance: $${user.wallet.toFixed(2)}*\n\n` +
            `Thank you for your payment!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛒 Go Shopping', 'browse_products')],
                    [Markup.button.callback('💰 View Wallet', 'my_wallet')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        // Clear session
        delete global.sessions[userId];
        global.sessions[userId] = { lastBotMessage: msg.message_id };
        
        await ctx.answerCbQuery('✅ Payment confirmed!');
    });

    // Withdraw funds
    bot.action('withdraw_funds', async (ctx) => {
        const userId = ctx.from.id;
        const user = global.users[userId];
        
        await deleteMessage(ctx);
        
        if (user.wallet <= 0) {
            const msg = await ctx.reply(
                `🏧 *Withdraw Funds*\n\n` +
                `Your wallet balance is $${user.wallet.toFixed(2)}\n\n` +
                `❌ You cannot withdraw with zero balance!`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💵 Deposit Funds', 'deposit_funds')],
                        [Markup.button.callback('🔙 Back to Wallet', 'my_wallet')]
                    ])
                }
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        const msg = await ctx.reply(
            `🏧 *Withdraw Funds*\n\n` +
            `Current Balance: *$${user.wallet.toFixed(2)}*\n` +
            `Minimum Withdrawal: $10\n` +
            `Maximum Withdrawal: $${user.wallet.toFixed(2)}\n\n` +
            `Choose withdrawal method:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🏦 Bank Transfer', 'withdraw_bank'),
                        Markup.button.callback('📱 Mobile Money', 'withdraw_mobile')
                    ],
                    [
                        Markup.button.callback('💳 Credit Card', 'withdraw_card'),
                        Markup.button.callback('📧 PayPal', 'withdraw_paypal')
                    ],
                    [Markup.button.callback('🔙 Back to Wallet', 'my_wallet')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Bank withdrawal
    bot.action('withdraw_bank', async (ctx) => {
        const userId = ctx.from.id;
        const user = global.users[userId];
        
        await deleteMessage(ctx);
        
        global.sessions[userId] = {
            step: 'awaiting_withdrawal_amount',
            withdrawalMethod: 'bank',
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `🏦 *Bank Withdrawal*\n\n` +
            `Current Balance: *$${user.wallet.toFixed(2)}*\n\n` +
            `Please enter the amount to withdraw:\n\n` +
            `Minimum: $10\n` +
            `Maximum: $${user.wallet.toFixed(2)}\n\n` +
            `Enter amount in USD:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'withdraw_funds')]
                ])
            }
        );
        
        global.sessions[userId].lastBotMessage = msg.message_id;
    });

    // Transaction history
    bot.action('transaction_history', async (ctx) => {
        const userId = ctx.from.id;
        const user = global.users[userId];
        
        await deleteMessage(ctx);
        
        if (!user.transactions || user.transactions.length === 0) {
            const msg = await ctx.reply(
                `📋 *Transaction History*\n\n` +
                `No transactions found.\n` +
                `Start by making a deposit or purchase!`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💵 Deposit Funds', 'deposit_funds')],
                        [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                        [Markup.button.callback('🔙 Back to Wallet', 'my_wallet')]
                    ])
                }
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        // Sort transactions by date (newest first)
        const transactions = user.transactions.sort((a, b) => b.timestamp - a.timestamp);
        
        let message = `📋 *Transaction History*\n\n`;
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        
        transactions.slice(0, 10).forEach((txn, index) => {
            const typeEmoji = txn.type === 'deposit' ? '⬇️' : '⬆️';
            const sign = txn.type === 'deposit' ? '+' : '-';
            
            message += `${index + 1}. ${typeEmoji} ${txn.type.toUpperCase()}\n`;
            message += `   Amount: ${sign}$${txn.amount.toFixed(2)}\n`;
            message += `   Method: ${txn.method}\n`;
            message += `   Date: ${txn.date} ${txn.time}\n`;
            message += `   Status: ${txn.status}\n\n`;
            
            if (txn.type === 'deposit') totalDeposits += txn.amount;
            if (txn.type === 'withdrawal') totalWithdrawals += txn.amount;
        });
        
        message += `📊 *Summary*\n`;
        message += `Total Deposits: +$${totalDeposits.toFixed(2)}\n`;
        message += `Total Withdrawals: -$${totalWithdrawals.toFixed(2)}\n`;
        message += `Net Change: $${(totalDeposits - totalWithdrawals).toFixed(2)}\n`;
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('⬇️ Deposits', 'filter_deposits'),
                        Markup.button.callback('⬆️ Withdrawals', 'filter_withdrawals')
                    ],
                    [Markup.button.callback('🔄 Refresh', 'transaction_history')],
                    [Markup.button.callback('🔙 Back to Wallet', 'my_wallet')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Pay with wallet (from cart)
    bot.action('pay_with_wallet', async (ctx) => {
        const userId = ctx.from.id;
        const user = global.users[userId];
        const cart = global.carts[userId];
        
        if (!cart || cart.items.length === 0) {
            await ctx.answerCbQuery('Cart is empty!');
            return;
        }
        
        if (user.wallet < cart.total) {
            await ctx.answerCbQuery('Insufficient wallet balance!');
            return;
        }
        
        await deleteMessage(ctx);
        
        // Create order
        const orderId = `order_${Date.now()}_${userId}`;
        const { date, time } = getCurrentDateTime();
        
        const order = {
            id: orderId,
            user_id: userId,
            items: cart.items,
            subtotal: cart.total,
            shipping_fee: 5.00, // Example shipping fee
            tax: cart.total * 0.08, // 8% tax
            total_amount: cart.total + 5.00 + (cart.total * 0.08),
            payment_method: 'wallet',
            status: 'pending',
            shipping_address: '',
            created_at: Date.now(),
            updated_at: Date.now()
        };
        
        // Deduct from wallet
        user.wallet -= order.total_amount;
        user.total_spent += order.total_amount;
        user.orders_count += 1;
        
        // Deduct stock
        for (const item of cart.items) {
            const product = global.products[item.id];
            if (product) {
                product.stock -= item.quantity;
                product.sold = (product.sold || 0) + item.quantity;
            }
        }
        
        // Save order
        global.orders[orderId] = order;
        
        // Record transaction
        if (!user.transactions) user.transactions = [];
        user.transactions.push({
            id: `txn_${Date.now()}_${userId}`,
            type: 'purchase',
            amount: order.total_amount,
            method: 'wallet',
            order_id: orderId,
            status: 'completed',
            date: date,
            time: time,
            timestamp: Date.now()
        });
        
        // Save all changes
        saveDatabase('users');
        saveDatabase('products');
        saveDatabase('orders');
        
        // Clear cart
        global.carts[userId] = { items: [], total: 0 };
        
        const msg = await ctx.reply(
            `✅ *Order Placed Successfully!*\n\n` +
            `Order ID: ${orderId}\n` +
            `Amount: $${order.total_amount.toFixed(2)}\n` +
            `Payment: Wallet\n` +
            `Status: Pending\n\n` +
            `💰 *New Wallet Balance: $${user.wallet.toFixed(2)}*\n\n` +
            `We'll notify you when your order is processed.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View Order', `order_details_${orderId}`)],
                    [Markup.button.callback('🛒 Continue Shopping', 'browse_products')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        // Notify admin
        await bot.telegram.sendMessage(
            ADMIN_ID,
            `🆕 *New Order Received!*\n\n` +
            `Order ID: ${orderId}\n` +
            `Customer: ${user.name}\n` +
            `Amount: $${order.total_amount.toFixed(2)}\n` +
            `Payment: Wallet\n\n` +
            `Items: ${cart.items.length}\n` +
            `Total: $${order.total_amount.toFixed(2)}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View Order', `order_details_${orderId}`)],
                    [Markup.button.callback('✅ Process Order', `process_order_${orderId}`)]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });
};
