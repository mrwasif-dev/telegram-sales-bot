```javascript
const { Telegraf } = require('telegraf');
require('dotenv').config();

// Create bot instance
const bot = new Telegraf(process.env.BOT_TOKEN);

// Global variables will be available in all handlers
global.users = {};
global.products = {};
global.orders = {};
global.carts = {};
global.sessions = {};

// Export bot instance
module.exports = bot;
