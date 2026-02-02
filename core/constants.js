module.exports = {
    // Admin ID
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || 6012422087,
    
    // Bot settings
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    
    // Payment settings
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'stripe',
    
    // Order statuses
    ORDER_STATUS: {
        PENDING: 'pending',
        PROCESSING: 'processing',
        SHIPPED: 'shipped',
        DELIVERED: 'delivered',
        CANCELLED: 'cancelled'
    },
    
    // User roles
    USER_ROLES: {
        USER: 'user',
        ADMIN: 'admin',
        SELLER: 'seller'
    },
    
    // Currency
    CURRENCY: 'USD',
    CURRENCY_SYMBOL: '$'
};
