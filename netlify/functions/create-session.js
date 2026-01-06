const https = require('https');
const crypto = require('crypto');

// --- قاعدة بيانات الروابط (Endpionts Map) ---
// تم تجميعها من الوثائق التي أرسلتها حرفياً
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

  // === Pay By Link ===
  'createQuickLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice/quick', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'createPaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'getAllPaymentLinks': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'updatePaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'PUT', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'fetchPaymentLink': {
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}',
    method: 'GET',
    host: 'api.ksamerchant.geidea.net'
  },
  'deletePaymentLink': {
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}',
    method: 'DELETE',
    host: 'api.ksamerchant.geidea.net'
  },
  'sendLinkEmail': {
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}/SendByEmail',
    method: 'POST',
    host: 'api.ksamerchant.geidea.net'
  },
  'sendLinkSms': {
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}/sendBySms',
    method: 'POST',
    host: 'api.ksamerchant.geidea.net'
  },

  // === Direct API (PGW) ===
  'applePay': { 
    path: '/pgw/api/v2/direct/apple/pay', 
    method: 'POST', 
    host: 'api.geidea.ae' // لاحظ اختلاف السيرفر حسب التوثيق
  },
  'initiateAuth': { 
    path: '/pgw/api/v6/direct/authenticate/initiate', 
    method: 'POST', 
    host: 'api.geidea.ae' 
  },
  'authenticatePayer': { 
    path: '/pgw/api/v6/direct/authenticate/payer', 
    method: 'POST', 
    host: 'api.geidea.ae' 
  },
  'pay': { 
    path: '/pgw/api/v2/direct/pay', 
    method: 'POST', 
    host: 'api.geidea.ae' 
  },
  'payToken': { // MIT
    path: '/pgw/api/v2/direct/pay/token', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'capture': { 
    path: '/pgw/api/v1/direct/capture', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'void': { 
    path: '/pgw/api/v3/direct/void', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'refund': { 
    path: '/pgw/api/v2/direct/refund', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'cancelOrder': { 
    path: '/pgw/api/v1/direct/cancel', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'fetchOrders': { 
    path: '/pgw/api/v1/direct/order', 
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'fetchOrderById': { 
    path: '/pgw/api/v1/direct/order/{orderId}', 
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'retrieveToken': { 
    path: '/pgw/api/v1/direct/token/{tokenId}', 
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net' 
  },
  'fetchOrderByRef': { 
    path: '/pgw/api/v1/direct/order', // Uses query param
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net' 
  },

  // === Meeza & QR ===
  'createMeezaQR': { 
    path: '/payment-intent/api/v2/meezaPayment/image/base64', 
    method: 'POST', 
    host: 'api.merchant.geidea.net' // سيرفر خاص بـ Meeza
  },
  'meezaRequestToPay': { 
    path: '/meeza/api/v2/direct/transaction/requestToPay', 
    method: 'POST', 
    host: 'api.merchant.geidea.net' 
  },
  'getMeezaOrderId': { 
    path: '/payment-intent/api/v1/paymentIntent/{paymentIntentID}', 
    method: 'GET', 
    host: 'api.merchant.geidea.net' 
  },
  'getMeezaOrderDetails': { 
    path: '/pgw/api/v1/order/{paymentIntentId}/{orderId}', 
    method: 'GET', 
    host: 'api.merchant.geidea.net' 
  },
  'meezaNotification': { 
    path: '/pgw/api/v1/MeezaPaymentNotification', 
    method: 'POST', 
    host: 'api.merchant.geidea.net' 
  },

  // === Subscriptions ===
  'createSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  'getSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription/{subscriptionid}', 
    method: 'GET', 
    host: 'api.ksamerchant.geidea.net',
    sign: true 
  },
  'cancelSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription/{subscriptionid}/cancel', 
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
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) throw new Error('Missing Keys in Netlify');

    const incomingData = JSON.parse(event.body);
    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    
    const config = ENDPOINTS[operation];
    if (!config) throw new Error(`Unknown operation: ${operation}`);

    // 1. تجهيز الروابط والمتغيرات (Path Params)
    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => {
            finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]);
        });
    }
    // تنظيف payload من pathParams لكي لا يرسل في الـ Body
    const { pathParams, queryParams, ...bodyData } = payload;

    // 2. تجهيز Query Params لطلبات GET
    if (queryParams) {
        const query = new URLSearchParams(queryParams).toString();
        finalPath += `?${query}`;
    }

    // 3. تجهيز الـ Body وإضافة البيانات التلقائية
    const timestamp = new Date().toISOString();
    
    // نسخ البيانات الموجودة
    let finalBody = { ...bodyData };

    // حقن Public Key تلقائياً إذا كان مطلوباً في الـ Body (مثل Meeza)
    if (operation === 'createMeezaQR' || operation === 'meezaRequestToPay') {
        if (!finalBody.merchantPublicKey) finalBody.merchantPublicKey = publicKey;
    }

    // حقن التوقيع (Signature) للعمليات التي تتطلبه
    if (config.sign) {
        finalBody.timestamp = timestamp;
        
        const currency = finalBody.currency || 'SAR';
        const amount = finalBody.amount ? parseFloat(finalBody.amount) : 0;
        
        // توليد MerchantRefId إذا لم يوجد للعمليات الجديدة
        if (!finalBody.merchantReferenceId && operation.includes('create')) {
            finalBody.merchantReferenceId = `REF-${crypto.randomUUID().substring(0, 12)}`;
        }
        const refId = finalBody.merchantReferenceId || '';

        // معادلة التوقيع (Standard V2 Pattern)
        // PublicKey + Amount(0.00) + Currency + RefId + Timestamp
        let dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${refId}${timestamp}`;

        // استثناءات المعادلات
        if (operation === 'saveCard') {
            dataToSign = `${publicKey}${currency}${timestamp}`;
        }
        
        const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');
        finalBody.signature = signature;
    }

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    console.log(`[${operation}] Connecting to: ${config.host}${finalPath}`);
    console.log(`Payload:`, JSON.stringify(finalBody));

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
      statusCode: 200, // نرجع دائماً 200 للفرونت، والخطأ الحقيقي داخل الجسم
      headers,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};