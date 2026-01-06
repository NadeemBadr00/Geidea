const https = require('https');
const crypto = require('crypto');

// --- إعدادات العمليات (Endpoints) ---
const ENDPOINTS = {
  'createSession': { 
    path: '/payment-intent/api/v2/direct/session', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  // ... باقي العمليات (يمكنك تركها كما هي في ملفك الأصلي) ...
  'pay': { path: '/pgw/api/v2/direct/pay', method: 'POST', host: 'api.geidea.ae' },
  'capture': { path: '/pgw/api/v1/direct/capture', method: 'POST', host: 'api.ksamerchant.geidea.net' },
  'void': { path: '/pgw/api/v3/direct/void', method: 'POST', host: 'api.ksamerchant.geidea.net' },
  'refund': { path: '/pgw/api/v2/direct/refund', method: 'POST', host: 'api.ksamerchant.geidea.net', sign: true },
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  // 1. CORS
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // ---------------------------------------------------------
  // 2. (GET) صفحة النتيجة - تظهر للمستخدم في المتصفح بعد الدفع
  // ---------------------------------------------------------
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters || {};
    
    // تحليل النتيجة من جيديا
    const responseCode = queryParams.responseCode || 'N/A';
    const responseMessage = queryParams.responseMessage || 'No message provided';
    const isSuccess = responseCode === '000' || responseCode === '0';
    
    const statusColor = isSuccess ? '#10B981' : '#EF4444';
    const statusIcon = isSuccess ? '✔' : '✖';
    const statusTitle = isSuccess ? 'تمت العملية بنجاح' : 'فشلت العملية';
    const statusDesc = isSuccess ? 'تم تأكيد الدفع. يمكنك الآن العودة للتطبيق.' : 'لم يتم خصم المبلغ. يرجى العودة للتطبيق والمحاولة مرة أخرى.';

    // صفحة HTML بسيطة وجميلة
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>حالة الدفع</title>
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; text-align: center; }
              .card { background: white; padding: 40px 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; width: 100%; }
              .icon-circle { width: 80px; height: 80px; background-color: ${statusColor}20; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; }
              .icon { font-size: 40px; color: ${statusColor}; }
              h2 { color: #1f2937; margin: 0 0 10px 0; font-size: 24px; }
              p { color: #6b7280; line-height: 1.5; margin-bottom: 30px; }
              .details { background: #f9fafb; padding: 15px; border-radius: 10px; font-size: 14px; color: #374151; margin-bottom: 20px; text-align: right; }
              .btn { display: block; width: 100%; padding: 15px 0; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px; }
              .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; }
          </style>
      </head>
      <body>
          <div class="card">
              <div class="icon-circle">
                  <span class="icon">${statusIcon}</span>
              </div>
              <h2>${statusTitle}</h2>
              <p>${statusDesc}</p>
              
              <div class="details">
                  <strong>كود الحالة:</strong> ${responseCode}<br>
                  <strong>الرسالة:</strong> ${responseMessage}
              </div>

              <div style="background-color: #fffbeb; color: #b45309; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 20px;">
                  ⚠️ يرجى إغلاق هذه الصفحة والعودة للتطبيق يدوياً للتحقق من الرصيد.
              </div>
          </div>
      </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html
    };
  }

  // ---------------------------------------------------------
  // 3. إنشاء الجلسة (POST)
  // ---------------------------------------------------------
  if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing Keys' }) };

    let incomingData;
    try { incomingData = JSON.parse(event.body); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    const config = ENDPOINTS[operation];
    
    if (!config) return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown operation: ${operation}` }) };

    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]));
    }
    const { pathParams, queryParams, ...bodyData } = payload;
    if (queryParams) finalPath += `?${new URLSearchParams(queryParams).toString()}`;

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
        if (operation === 'saveCard') dataToSign = `${publicKey}${currency}${timestamp}`;
        const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');
        finalBody.signature = signature;
    }

    const authHeader = `Basic ${Buffer.from(`${publicKey}:${apiPassword}`).toString('base64')}`;
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};