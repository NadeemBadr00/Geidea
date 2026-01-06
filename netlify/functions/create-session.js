const https = require('https');
const crypto = require('crypto');

// إعدادات الروابط (Endpoints) حسب التوثيق
const ENDPOINTS = {
  // --- Checkout V2 ---
  'createSession': { path: '/payment-intent/api/v2/direct/session', method: 'POST', version: 'v2' },
  'createSessionSubscription': { path: '/payment-intent/api/v2/direct/session-subscription', method: 'POST', version: 'v2' },
  'saveCard': { path: '/payment-intent/api/v2/direct/session/saveCard', method: 'POST', version: 'v2' },
  
  // --- Pay By Link (V1) ---
  'createQuickLink': { path: '/payment-intent/api/v1/direct/eInvoice/quick', method: 'POST', version: 'v2' }, // يتطلب توقيع
  'createPaymentLink': { path: '/payment-intent/api/v1/direct/eInvoice', method: 'POST', version: 'v1' },
  'getAllPaymentLinks': { path: '/payment-intent/api/v1/direct/eInvoice', method: 'GET', version: 'v1' },
  'updatePaymentLink': { path: '/payment-intent/api/v1/direct/eInvoice', method: 'PUT', version: 'v1' },
  
  // --- Direct API (PGW) ---
  'pay': { path: '/pgw/api/v2/direct/pay', method: 'POST', version: 'v1' },
  'payToken': { path: '/pgw/api/v2/direct/pay/token', method: 'POST', version: 'v2' },
  'capture': { path: '/pgw/api/v1/direct/capture', method: 'POST', version: 'v1' },
  'void': { path: '/pgw/api/v3/direct/void', method: 'POST', version: 'v1' },
  'refund': { path: '/pgw/api/v2/direct/refund', method: 'POST', version: 'v2' },
  'cancelOrder': { path: '/pgw/api/v1/direct/cancel', method: 'POST', version: 'v1' },
  'getOrder': { path: '/pgw/api/v1/direct/order', method: 'GET', version: 'v1' },
  
  // --- Authentication ---
  'initiateAuth': { path: '/pgw/api/v6/direct/authenticate/initiate', method: 'POST', version: 'v1' },
  'authenticatePayer': { path: '/pgw/api/v6/direct/authenticate/payer', method: 'POST', version: 'v1' },

  // --- Subscriptions ---
  'createSubscription': { path: '/subscriptions/api/v1/direct/subscription', method: 'POST', version: 'v2' },
  
  // --- Apple Pay ---
  'applePay': { path: '/pgw/api/v2/direct/apple/pay', method: 'POST', version: 'v1' },

  // --- Meeza QR (تمت الإضافة) ---
  'createMeezaQR': { path: '/payment-intent/api/v2/meezaPayment/image/base64', method: 'POST', version: 'v1' },
  'meezaRequestToPay': { path: '/meeza/api/v2/direct/transaction/requestToPay', method: 'POST', version: 'v1' }
};

// السيرفر الافتراضي
const DEFAULT_HOSTNAME = 'api.ksamerchant.geidea.net';
// سيرفر Meeza أحياناً يكون مختلفاً (api.merchant.geidea.net)، سنتعامل معه بذكاء إذا لزم الأمر
// ولكن بناءً على التوثيق، سنستخدم نفس النطاق إلا إذا فشل

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) throw new Error('Missing Keys');

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const incomingData = JSON.parse(event.body);
    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    
    const endpointConfig = ENDPOINTS[operation];
    if (!endpointConfig) throw new Error(`Unknown operation: ${operation}`);

    const timestamp = new Date().toISOString();
    const currency = payload.currency || 'SAR';
    const amount = payload.amount ? parseFloat(payload.amount) : 0;
    
    let merchantReferenceId = payload.merchantReferenceId;
    if (!merchantReferenceId && operation === 'createSession') {
        merchantReferenceId = `ORD-${crypto.randomUUID().substring(0, 15)}`;
    }

    let finalBody = { ...payload };

    // منطق التوقيع (فقط للعمليات التي تتطلب V2 Signature)
    if (endpointConfig.version === 'v2') {
        finalBody.timestamp = timestamp;
        let dataToSign = "";

        if (operation === 'saveCard') {
            dataToSign = `${publicKey}${currency}${timestamp}`;
        } else if (operation === 'createSession' || operation === 'createQuickLink') {
            dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${merchantReferenceId}${timestamp}`;
            finalBody.merchantReferenceId = merchantReferenceId;
        } else if (operation === 'refund') {
             dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${payload.orderId || ''}${timestamp}`;
        } else {
            dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${merchantReferenceId || ''}${timestamp}`;
        }

        const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');
        finalBody.signature = signature;
    }

    // إعدادات افتراضية لـ Create Session
    if (operation === 'createSession') {
        finalBody.paymentOperation = finalBody.paymentOperation || "Pay";
        finalBody.initiatedBy = finalBody.initiatedBy || "Internet";
        finalBody.callbackUrl = finalBody.callbackUrl || "https://geideaa.netlify.app/";
        finalBody.returnUrl = finalBody.returnUrl || "https://geideaa.netlify.app/";
    }

    const requestData = JSON.stringify(finalBody);
    console.log(`[${operation}] Request:`, requestData);

    let finalPath = endpointConfig.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => {
            finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]);
        });
    }

    if (endpointConfig.method === 'GET' && payload.queryParams) {
        const query = new URLSearchParams(payload.queryParams).toString();
        finalPath += `?${query}`;
    }

    // تصحيح الرابط لـ Meeza إذا لزم الأمر (حسب التوثيق أحياناً يكون مختلف)
    let hostname = DEFAULT_HOSTNAME;
    if (operation.includes('Meeza') || operation.includes('meeza')) {
        // إذا كان التوثيق يشير إلى نطاق مختلف لـ Meeza، يمكن تغييره هنا
        // hostname = 'api.merchant.geidea.net'; 
    }

    const options = {
      hostname: hostname,
      path: finalPath,
      method: endpointConfig.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': endpointConfig.method !== 'GET' ? Buffer.byteLength(requestData) : 0,
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

      if (endpointConfig.method !== 'GET') req.write(requestData);
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error('System Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server Error', message: error.message })
    };
  }
};