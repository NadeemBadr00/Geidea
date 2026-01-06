const https = require('https');
const crypto = require('crypto');

// إعدادات Geidea (استخدم Environment Variables في الإنتاج)
const GEIDEA_CONFIG = {
    host: 'api.ksamerchant.geidea.net',
    publicKey: process.env.GEIDEA_PUBLIC_KEY || "e88313e2-1234-4321-abcd-1234567890ab", // استبدل بمفتاحك
    apiPassword: process.env.GEIDEA_API_PASSWORD || "YOUR_API_PASSWORD_HERE" // استبدل بكلمة المرور
};

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        const payload = {
            amount: data.amount || 100.00,
            currency: "SAR",
            callbackUrl: data.callbackUrl || "https://google.com",
            timestamp: new Date().toISOString(),
            merchantReferenceId: data.userId // نرسل معرف المستخدم كمرجع للعملية
        };

        const authString = `${GEIDEA_CONFIG.publicKey}:${GEIDEA_CONFIG.apiPassword}`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

        const requestOptions = {
            hostname: GEIDEA_CONFIG.host,
            path: '/payment-intent/api/v2/direct/session',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Content-Length': Buffer.byteLength(JSON.stringify(payload)),
                'X-Correlation-ID': crypto.randomUUID()
            }
        };

        const responseBody = await new Promise((resolve, reject) => {
            const req = https.request(requestOptions, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => resolve(body));
            });
            req.on('error', (err) => reject(err));
            req.write(JSON.stringify(payload));
            req.end();
        });

        const jsonResponse = JSON.parse(responseBody);

        if (jsonResponse && jsonResponse.session && jsonResponse.session.id) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, sessionId: jsonResponse.session.id })
            };
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: "Geidea Error", details: jsonResponse })
            };
        }

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};