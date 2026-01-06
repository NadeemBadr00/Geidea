const https = require('https');
const crypto = require('crypto');

// --- إعداد السيرفر الرئيسي ---
// هام: نستخدم نفس السيرفر لجميع الطلبات لضمان توافق الجلسات
const MAIN_HOST = 'api.ksamerchant.geidea.net';

const ENDPOINTS = {
  // === Checkout V2 ===
  'createSession': { 
    path: '/payment-intent/api/v2/direct/session', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },
  'createSessionSubscription': { 
    path: '/payment-intent/api/v2/direct/session-subscription', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },
  'saveCard': { 
    path: '/payment-intent/api/v2/direct/session/saveCard', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },

  // === Pay By Link (تم الإصلاح: يتطلب توقيع أحياناً) ===
  'createQuickLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice/quick', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },
  'createPaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'POST', 
    version: 'v1' 
  },
  'getAllPaymentLinks': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'GET', 
    version: 'v1' 
  },
  'updatePaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice', 
    method: 'PUT', 
    version: 'v1' 
  },
  'deletePaymentLink': { 
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}', 
    method: 'DELETE', 
    version: 'v1' 
  },
  'sendLinkEmail': { 
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}/SendByEmail', 
    method: 'POST', 
    version: 'v1' 
  },
  'sendLinkSms': { 
    path: '/payment-intent/api/v1/direct/eInvoice/{paymentIntentId}/sendBySms', 
    method: 'POST', 
    version: 'v1' 
  },

  // === Direct API ===
  'capture': { 
    path: '/pgw/api/v1/direct/capture', 
    method: 'POST', 
    version: 'v1' 
  },
  'void': { 
    path: '/pgw/api/v3/direct/void', 
    method: 'POST', 
    version: 'v1' 
  },
  'refund': { 
    path: '/pgw/api/v2/direct/refund', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },
  'fetchOrderById': { 
    path: '/pgw/api/v1/direct/order/{orderId}', 
    method: 'GET', 
    version: 'v1' 
  },
  'pay': { 
    path: '/pgw/api/v2/direct/pay', 
    method: 'POST', 
    version: 'v1' 
  },

  // === Meeza & QR ===
  // تم تحويلها لاستخدام MAIN_HOST لمحاولة حل مشكلة 404
  'createMeezaQR': { 
    path: '/payment-intent/api/v2/meezaPayment/image/base64', 
    method: 'POST', 
    version: 'v1' 
  },
  'meezaRequestToPay': { 
    path: '/meeza/api/v2/direct/transaction/requestToPay', 
    method: 'POST', 
    version: 'v1' 
  },

  // === Subscriptions ===
  'createSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription', 
    method: 'POST', 
    version: 'v2', 
    sign: true 
  },
  'getSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription/{subscriptionid}', 
    method: 'GET', 
    version: 'v2', 
    sign: true 
  },
  'cancelSubscription': { 
    path: '/subscriptions/api/v1/direct/subscription/{subscriptionid}/cancel', 
    method: 'POST', 
    version: 'v2', 
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

    if (!publicKey || !apiPassword) throw new Error('Missing Keys in Netlify Environment Variables');

    const incomingData = JSON.parse(event.body);
    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    
    const config = ENDPOINTS[operation];
    if (!config) throw new Error(`Unknown operation: ${operation}`);

    // 1. معالجة Path Params (مثل {orderId})
    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => {
            finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]);
        });
    }
    // فصل بيانات الجسم عن بيانات الرابط
    const { pathParams, queryParams, ...bodyData } = payload;

    // 2. معالجة Query Params
    if (queryParams) {
        const query = new URLSearchParams(queryParams).toString();
        finalPath += `?${query}`;
    }

    // 3. تجهيز جسم الطلب (Request Body)
    const timestamp = new Date().toISOString();
    let finalBody = { ...bodyData };

    // -- معالجة خاصة: إضافة Public Key لطلبات QR --
    if (operation === 'createMeezaQR' || operation === 'meezaRequestToPay') {
        if (!finalBody.merchantPublicKey) finalBody.merchantPublicKey = publicKey;
    }

    // -- معالجة التوقيع الإلكتروني (Signature) --
    if (config.sign) {
        finalBody.timestamp = timestamp;
        
        const currency = finalBody.currency || 'SAR';
        const amount = finalBody.amount ? parseFloat(finalBody.amount) : 0;
        
        // توليد Merchant Ref ID إذا لم يكن موجوداً
        if (!finalBody.merchantReferenceId && operation.includes('create')) {
            finalBody.merchantReferenceId = `REF-${crypto.randomUUID().substring(0, 12)}`;
        }
        const refId = finalBody.merchantReferenceId || '';

        // معادلة التوقيع القياسية (V2 Standard)
        // PublicKey + Amount(0.00) + Currency + RefId + Timestamp
        let dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${refId}${timestamp}`;

        // استثناءات للمعادلة حسب نوع العملية
        if (operation === 'saveCard') {
            dataToSign = `${publicKey}${currency}${timestamp}`;
        } else if (operation === 'refund') {
            dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${finalBody.orderId || ''}${timestamp}`;
        }
        
        const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');
        finalBody.signature = signature;
    }

    // إعدادات افتراضية لإنشاء الجلسة
    if (operation === 'createSession') {
        finalBody.paymentOperation = finalBody.paymentOperation || "Pay";
        finalBody.initiatedBy = finalBody.initiatedBy || "Internet";
        finalBody.callbackUrl = finalBody.callbackUrl || "https://geideaa.netlify.app/";
        finalBody.returnUrl = finalBody.returnUrl || "https://geideaa.netlify.app/";
    }

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    console.log(`[${operation}] Connecting to: ${MAIN_HOST}${finalPath}`);
    // console.log(`Payload:`, JSON.stringify(finalBody));

    const requestData = JSON.stringify(finalBody);

    const options = {
      hostname: MAIN_HOST, // استخدام السيرفر السعودي الموحد
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
             // في حالة رجوع HTML أو نص عادي
             resolve({ _statusCode: res.statusCode, rawBody: body });
          }
        });
      });

      req.on('error', (err) => {
        console.error('Network Error:', err);
        reject(err);
      });

      if (config.method !== 'GET') {
        req.write(requestData);
      }
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
      body: JSON.stringify({ error: error.message })
    };
  }
};