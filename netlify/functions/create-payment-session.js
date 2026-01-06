const https = require('https');
const crypto = require('crypto');

// --- قاعدة بيانات الروابط (Endpionts Map) ---
const ENDPOINTS = {
  // === Checkout V2 ===
  'createSession': { 
    path: '/payment-intent/api/v2/direct/session', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'createSessionSubscription': { 
    path: '/payment-intent/api/v2/direct/session-subscription', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'saveCard': { 
    path: '/payment-intent/api/v2/direct/session/saveCard', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  // === Pay By Link & Invoices ===
  'createQuickLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice/quick', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'createPaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net',
    sign: true
  },
  // === Direct API (PGW) ===
  'pay': { 
    path: '/pgw/api/v2/direct/pay', 
    method: 'POST', 
    host: 'api.geidea.ae' 
  },
  // === Subscriptions ===
  'createSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  }
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };

  try {
    // ⚠️ تأكد من وضع هذه المفاتيح في إعدادات Netlify Environment Variables
    // أو يمكنك وضعها هنا مؤقتاً للتجربة (لكن لا تنشرها)
    const publicKey = process.env.GEIDEA_PUBLIC_KEY || "e88313e2-1234-4321-abcd-1234567890ab"; 
    const apiPassword = process.env.GEIDEA_API_PASSWORD || "YOUR_API_PASSWORD_HERE";

    if (!publicKey || !apiPassword) throw new Error('Missing Keys in Netlify');

    const incomingData = JSON.parse(event.body);
    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    
    const config = ENDPOINTS[operation];
    if (!config) throw new Error(`Unknown operation: ${operation}`);

    // 1. تجهيز المسار
    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => {
            finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]);
        });
    }
    const { pathParams, queryParams, ...bodyData } = payload;

    // 2. تجهيز Query Params
    if (queryParams) {
        const query = new URLSearchParams(queryParams).toString();
        finalPath += `?${query}`;
    }

    // 3. التوقيع (Signing)
    const timestamp = new Date().toISOString();
    let finalBody = { ...bodyData };

    if (config.sign) {
        finalBody.timestamp = timestamp;
        
        const currency = finalBody.currency || 'SAR';
        const amount = finalBody.amount ? parseFloat(finalBody.amount) : 0;
        
        if (!finalBody.merchantReferenceId && operation.includes('create')) {
            finalBody.merchantReferenceId = `REF-${crypto.randomUUID().substring(0, 12)}`;
        }
        const refId = finalBody.merchantReferenceId || '';

        let dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${refId}${timestamp}`;

        if (operation === 'saveCard') {
            dataToSign = `${publicKey}${currency}${timestamp}`;
        }
        
        const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');
        finalBody.signature = signature;
    }

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    console.log(`[${operation}] Payload:`, JSON.stringify(finalBody));

    const requestData = JSON.stringify(finalBody);
    const options = {
      hostname: config.host,
      path: finalPath,
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': config.method !== 'GET' ? Buffer.byteLength(requestData) : 0,
        'X-Correlation-ID': crypto.randomUUID()
      }
    };

    const responseBody = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
             const json = JSON.parse(body);
             json._statusCode = res.statusCode; 
             resolve(json);
          } catch (e) {
             resolve({ _statusCode: res.statusCode, rawBody: body });
          }
        });
      });
      req.on('error', (err) => reject(err));
      if (config.method !== 'GET') req.write(requestData);
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error("Function Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};