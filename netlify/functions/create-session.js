const axios = require('axios');

// إعدادات جيديا
const GEIDEA_CONFIG = {
    publicKey: '88963e28-ee73-4eb7-b0b6-6f1bf6938418',
    apiPassword: 'd3e031a3-e6fa-4296-9363-c5debf587f65',
    apiUrl: 'https://api.geidea.net/payment-intent/api/v1/direct/session',
    currency: 'EGP'
};

exports.handler = async function(event, context) {
    // التأكد من أن الطلب هو POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // قراءة البيانات المرسلة من الفرونت إند
        const body = JSON.parse(event.body || '{}');
        const amount = body.amount || 100.00;

        // تجهيز بيانات الطلب لجيديا
        const payload = {
            amount: parseFloat(amount),
            currency: GEIDEA_CONFIG.currency,
            callbackUrl: "https://geidea-test.netlify.app/success", // رابط افتراضي، سيتم تحديثه لاحقاً
            timestamp: new Date().toISOString()
        };

        // التشفير (Basic Auth)
        const auth = Buffer.from(`${GEIDEA_CONFIG.publicKey}:${GEIDEA_CONFIG.apiPassword}`).toString('base64');

        // الاتصال بجيديا
        const response = await axios.post(GEIDEA_CONFIG.apiUrl, payload, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        // النجاح: إرجاع رقم الجلسة
        return {
            statusCode: 200,
            body: JSON.stringify({ sessionId: response.data.session.id })
        };

    } catch (error) {
        console.error("Geidea Error:", error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to create session" })
        };
    }
};
