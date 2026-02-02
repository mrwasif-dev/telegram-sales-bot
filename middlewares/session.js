// Session middleware to manage user sessions
// This file ensures sessions are properly initialized and cleaned up

module.exports = (bot) => {
    // Middleware to initialize session for each user
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        
        if (userId) {
            // Initialize session if not exists
            if (!global.sessions[userId]) {
                global.sessions[userId] = {
                    created: Date.now(),
                    lastActivity: Date.now(),
                    data: {}
                };
            } else {
                // Update last activity
                global.sessions[userId].lastActivity = Date.now();
            }
            
            // Clean up old sessions (older than 24 hours)
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            
            for (const [id, session] of Object.entries(global.sessions)) {
                if (now - session.lastActivity > twentyFourHours) {
                    delete global.sessions[id];
                }
            }
        }
        
        await next();
    });
    
    console.log('✅ Session middleware loaded');
};
