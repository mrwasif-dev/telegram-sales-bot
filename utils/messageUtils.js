async function deleteMessage(ctx, messageId = null) {
    try {
        const msgId = messageId || ctx.message?.message_id || ctx.update?.callback_query?.message?.message_id;
        if (msgId) {
            await ctx.deleteMessage(msgId);
            return true;
        }
    } catch (error) {
        console.log('Error deleting message:', error.message);
    }
    return false;
}

function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function formatPrice(amount) {
    return `$${parseFloat(amount).toFixed(2)}`;
}

function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

module.exports = {
    deleteMessage,
    escapeMarkdown,
    formatPrice,
    truncateText
};
