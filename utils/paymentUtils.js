const axios = require('axios');

class PaymentUtils {
    constructor() {
        this.provider = process.env.PAYMENT_PROVIDER || 'stripe';
        this.apiKey = process.env.STRIPE_SECRET_KEY;
    }

    async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
        try {
            if (this.provider === 'stripe' && this.apiKey) {
                const response = await axios.post(
                    'https://api.stripe.com/v1/payment_intents',
                    {
                        amount: Math.round(amount * 100), // Convert to cents
                        currency: currency,
                        metadata: metadata
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                return response.data;
            }
            return { client_secret: 'test_secret', id: 'test_payment_' + Date.now() };
        } catch (error) {
            console.error('Payment error:', error);
            return null;
        }
    }

    async verifyPayment(paymentId) {
        try {
            if (this.provider === 'stripe' && this.apiKey) {
                const response = await axios.get(
                    `https://api.stripe.com/v1/payment_intents/${paymentId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        }
                    }
                );
                return response.data.status === 'succeeded';
            }
            return true; // For testing
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }

    generateTestPaymentLink(amount, description) {
        return `https://payment.example.com/pay?amount=${amount}&desc=${encodeURIComponent(description)}`;
    }
}

module.exports = new PaymentUtils();
