const { Markup } = require('telegraf');
const { deleteMessage, formatPrice } = require('../utils/messageUtils');
const { getCurrentDateTime } = require('../utils/dateTime');
const { saveDatabase } = require('../core/database');
const { ADMIN_ID, USER_ROLES } = require('../core/constants');

module.exports = (bot) => {
    // Browse products
    bot.action('browse_products', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const products = Object.entries(global.products)
            .filter(([_, p]) => p.status === 'active' && p.stock > 0)
            .slice(0, 20);
        
        if (products.length === 0) {
            const msg = await ctx.reply(
                '📭 *No Products Available*\n\n' +
                'There are no products available at the moment.\n' +
                'Please check back later!',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                    ])
                }
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
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
        
        // Add category buttons if products have categories
        const categories = [...new Set(products.map(([_, p]) => p.category).filter(Boolean))];
        if (categories.length > 0) {
            const categoryButtons = categories.map(cat => 
                Markup.button.callback(`📁 ${cat}`, `category_${cat}`)
            );
            buttons.push(categoryButtons.slice(0, 3));
        }
        
        buttons.push([
            Markup.button.callback('🔍 Search Products', 'search_products'),
            Markup.button.callback('🔙 Back', 'back_to_main')
        ]);
        
        const msg = await ctx.reply(
            `🛒 *Browse Products*\n\n` +
            `Found ${products.length} products available.\n` +
            `Select a product to view details:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // View product details
    bot.action(/^view_product_(.+)$/, async (ctx) => {
        const productId = ctx.match[1];
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        const product = global.products[productId];
        
        if (!product) {
            const msg = await ctx.reply(
                'Product not found!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Products', 'browse_products')]
                ])
            );
            global.sessions[userId] = { lastBotMessage: msg.message_id };
            return;
        }
        
        // Initialize cart for user if not exists
        if (!global.carts[userId]) {
            global.carts[userId] = { items: [], total: 0 };
        }
        
        const isInCart = global.carts[userId].items.some(item => item.id === productId);
        const cartButton = isInCart 
            ? Markup.button.callback('➖ Remove from Cart', `remove_from_cart_${productId}`)
            : Markup.button.callback('➕ Add to Cart', `add_to_cart_${productId}`);
        
        const msg = await ctx.reply(
            `📦 *${product.name}*\n\n` +
            `${product.description || 'No description available.'}\n\n` +
            `💰 Price: $${product.price}\n` +
            `📦 Stock: ${product.stock} available\n` +
            `📁 Category: ${product.category || 'Uncategorized'}\n` +
            `⭐ Rating: ${product.rating || 'Not rated yet'}\n\n` +
            `Choose an action:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [cartButton],
                    [Markup.button.callback('🛒 View Cart', 'view_cart')],
                    [Markup.button.callback('📦 Buy Now', `buy_now_${productId}`)],
                    [
                        Markup.button.callback('◀️ Previous', `prev_product_${productId}`),
                        Markup.button.callback('Next ▶️', `next_product_${productId}`)
                    ],
                    [Markup.button.callback('🔙 Back to Products', 'browse_products')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
        await ctx.answerCbQuery();
    });

    // Add to cart
    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        const productId = ctx.match[1];
        const userId = ctx.from.id;
        
        const product = global.products[productId];
        
        if (!product) {
            await ctx.answerCbQuery('Product not found!');
            return;
        }
        
        if (product.stock <= 0) {
            await ctx.answerCbQuery('Out of stock!');
            return;
        }
        
        // Initialize cart if not exists
        if (!global.carts[userId]) {
            global.carts[userId] = { items: [], total: 0 };
        }
        
        // Check if already in cart
        const existingItem = global.carts[userId].items.find(item => item.id === productId);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            global.carts[userId].items.push({
                id: productId,
                name: product.name,
                price: product.price,
                quantity: 1,
                image: product.image
            });
        }
        
        // Update cart total
        global.carts[userId].total = global.carts[userId].items.reduce(
            (sum, item) => sum + (item.price * item.quantity), 0
        );
        
        await ctx.answerCbQuery(`Added ${product.name} to cart!`);
        
        // Update the product view
        await deleteMessage(ctx);
        
        const isInCart = true;
        const msg = await ctx.reply(
            `📦 *${product.name}*\n\n` +
            `${product.description || 'No description available.'}\n\n` +
            `💰 Price: $${product.price}\n` +
            `📦 Stock: ${product.stock} available\n\n` +
            `✅ Added to cart!\n` +
            `Cart now has ${global.carts[userId].items.reduce((sum, item) => sum + item.quantity, 0)} items`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➖ Remove from Cart', `remove_from_cart_${productId}`)],
                    [Markup.button.callback('🛒 View Cart', 'view_cart')],
                    [Markup.button.callback('📦 Buy Now', `buy_now_${productId}`)],
                    [Markup.button.callback('🔙 Back to Products', 'browse_products')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Remove from cart
    bot.action(/^remove_from_cart_(.+)$/, async (ctx) => {
        const productId = ctx.match[1];
        const userId = ctx.from.id;
        
        if (!global.carts[userId]) {
            await ctx.answerCbQuery('Cart is empty!');
            return;
        }
        
        const itemIndex = global.carts[userId].items.findIndex(item => item.id === productId);
        
        if (itemIndex === -1) {
            await ctx.answerCbQuery('Item not in cart!');
            return;
        }
        
        const product = global.products[productId];
        
        // Remove item from cart
        global.carts[userId].items.splice(itemIndex, 1);
        
        // Update cart total
        global.carts[userId].total = global.carts[userId].items.reduce(
            (sum, item) => sum + (item.price * item.quantity), 0
        );
        
        await ctx.answerCbQuery(`Removed ${product.name} from cart!`);
        
        // Update the product view
        await deleteMessage(ctx);
        
        const isInCart = false;
        const msg = await ctx.reply(
            `📦 *${product.name}*\n\n` +
            `${product.description || 'No description available.'}\n\n` +
            `💰 Price: $${product.price}\n` +
            `📦 Stock: ${product.stock} available\n\n` +
            `❌ Removed from cart`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add to Cart', `add_to_cart_${productId}`)],
                    [Markup.button.callback('🛒 View Cart', 'view_cart')],
                    [Markup.button.callback('🔙 Back to Products', 'browse_products')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // View cart
    bot.action('view_cart', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        if (!global.carts[userId] || global.carts[userId].items.length === 0) {
            const msg = await ctx.reply(
                '🛒 *Your Cart is Empty*\n\n' +
                'Add some products to your cart first!',
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
        
        const cart = global.carts[userId];
        let message = `🛒 *Your Shopping Cart*\n\n`;
        
        cart.items.forEach((item, index) => {
            message += `*${index + 1}. ${item.name}*\n`;
            message += `   Price: $${item.price} x ${item.quantity} = $${(item.price * item.quantity).toFixed(2)}\n`;
            message += `   [Remove](remove_cart_item_${item.id})\n\n`;
        });
        
        message += `\n💰 *Total: $${cart.total.toFixed(2)}*\n`;
        
        const msg = await ctx.reply(
            message,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('➕ Add More', 'browse_products'),
                        Markup.button.callback('🗑️ Clear Cart', 'clear_cart')
                    ],
                    [Markup.button.callback('💳 Checkout', 'checkout_cart')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Clear cart
    bot.action('clear_cart', async (ctx) => {
        const userId = ctx.from.id;
        
        if (!global.carts[userId] || global.carts[userId].items.length === 0) {
            await ctx.answerCbQuery('Cart is already empty!');
            return;
        }
        
        global.carts[userId] = { items: [], total: 0 };
        
        await ctx.answerCbQuery('Cart cleared!');
        
        await deleteMessage(ctx);
        
        const msg = await ctx.reply(
            '🛒 *Cart Cleared*\n\n' +
            'Your shopping cart has been cleared.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛒 Browse Products', 'browse_products')],
                    [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Checkout cart
    bot.action('checkout_cart', async (ctx) => {
        const userId = ctx.from.id;
        
        if (!global.carts[userId] || global.carts[userId].items.length === 0) {
            await ctx.answerCbQuery('Cart is empty!');
            return;
        }
        
        const cart = global.carts[userId];
        const user = global.users[userId];
        
        await deleteMessage(ctx);
        
        // Check stock availability
        for (const item of cart.items) {
            const product = global.products[item.id];
            if (!product || product.stock < item.quantity) {
                const msg = await ctx.reply(
                    `❌ *Stock Issue*\n\n` +
                    `${item.name} is out of stock or insufficient quantity available.\n` +
                    `Available: ${product ? product.stock : 0}, Requested: ${item.quantity}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🛒 Update Cart', 'view_cart')],
                            [Markup.button.callback('🔙 Back', 'back_to_main')]
                        ])
                    }
                );
                global.sessions[userId] = { lastBotMessage: msg.message_id };
                return;
            }
        }
        
        const msg = await ctx.reply(
            `💳 *Checkout*\n\n` +
            `Total Amount: $${cart.total.toFixed(2)}\n` +
            `Your Wallet Balance: $${user.wallet.toFixed(2)}\n\n` +
            `Choose payment method:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('💰 Wallet', 'pay_with_wallet'),
                        Markup.button.callback('💳 Card', 'pay_with_card')
                    ],
                    [Markup.button.callback('📱 Other', 'pay_with_other')],
                    [Markup.button.callback('🔙 Back to Cart', 'view_cart')]
                ])
            }
        );
        
        global.sessions[userId] = { lastBotMessage: msg.message_id };
    });

    // Buy now (single product)
    bot.action(/^buy_now_(.+)$/, async (ctx) => {
        const productId = ctx.match[1];
        const userId = ctx.from.id;
        
        const product = global.products[productId];
        
        if (!product) {
            await ctx.answerCbQuery('Product not found!');
            return;
        }
        
        if (product.stock <= 0) {
            await ctx.answerCbQuery('Out of stock!');
            return;
        }
        
        await deleteMessage(ctx);
        
        const user = global.users[userId];
        
        // Create a temporary single-item cart
        const tempCart = {
            items: [{
                id: productId,
                name: product.name,
                price: product.price,
                quantity: 1,
                image: product.image
            }],
            total: product.price
        };
        
        const msg = await ctx.reply(
            `💳 *Buy Now*\n\n` +
            `Product: ${product.name}\n` +
            `Price: $${product.price}\n\n` +
            `Your Wallet Balance: $${user.wallet.toFixed(2)}\n\n` +
            `Choose payment method:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('💰 Wallet', `pay_now_wallet_${productId}`),
                        Markup.button.callback('💳 Card', `pay_now_card_${productId}`)
                    ],
                    [Markup.button.callback('🔙 Back to Product', `view_product_${productId}`)]
                ])
            }
        );
        
        global.sessions[userId] = { 
            lastBotMessage: msg.message_id,
            tempCart: tempCart 
        };
    });

    // Search products
    bot.action('search_products', async (ctx) => {
        const userId = ctx.from.id;
        
        await deleteMessage(ctx);
        
        global.sessions[userId] = {
            step: 'awaiting_search_query',
            lastBotMessage: null
        };
        
        const msg = await ctx.reply(
            `🔍 *Search Products*\n\n` +
            `Please enter your search query:\n` +
            `(You can search by name, category, or description)`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'browse_products')]
                ])
            }
        );
        
        global.sessions[userId].lastBotMessage = msg.message_id;
    });
};
