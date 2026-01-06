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
  // 2. صفحة التشخيص (GET) - بتظهر لما ترجع من البنك
  // ---------------------------------------------------------
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters || {};
    const queryString = new URLSearchParams(queryParams).toString();
    const appDeepLink = `rorkapp://payment-status?platform=geidea&${queryString}`;

    // تحليل البيانات للعرض
    const responseCode = queryParams.responseCode || 'N/A';
    const responseMessage = queryParams.responseMessage || 'No message';
    const isSuccess = responseCode === '000' || responseCode === '0';
    const statusColor = isSuccess ? '#10B981' : '#EF4444';
    const statusText = isSuccess ? 'عملية ناجحة (Success)' : 'عملية فاشلة (Failed)';

    // HTML مع جدول تفاصيل للإيرور
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Geidea Debugger</title>
          <style>
              body { font-family: monospace; background-color: #1a1a1a; color: #e0e0e0; padding: 20px; text-align: center; }
              .card { background: #2d2d2d; padding: 20px; border-radius: 10px; border: 2px solid ${statusColor}; max-width: 500px; margin: 0 auto; }
              h2 { color: ${statusColor}; margin-top: 0; }
              table { width: 100%; text-align: left; margin: 20px 0; border-collapse: collapse; }
              th, td { padding: 8px; border-bottom: 1px solid #444; }
              th { color: #888; }
              .btn { display: block; margin-top: 20px; padding: 15px; background-color: ${statusColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-family: sans-serif; }
              .raw-data { background: #000; padding: 10px; font-size: 10px; color: #0f0; text-align: left; overflow-x: auto; margin-top: 20px; }
          </style>
          <script>
              window.onload = function() {
                  // تأخير التوجيه قليلاً عشان تلحق تشوف الإيرور لو فيه مشكلة
                  setTimeout(function() {
                      window.location.href = "${appDeepLink}";
                  }, 1500);
              };
          </script>
      </head>
      <body>
          <div class="card">
              <h2>${statusText}</h2>
              <table>
                  <tr><th>Code</th><td>${responseCode}</td></tr>
                  <tr><th>Message</th><td>${responseMessage}</td></tr>
                  <tr><th>Order ID</th><td>${queryParams.orderId || 'N/A'}</td></tr>
              </table>
              
              <a href="${appDeepLink}" class="btn">العودة للتطبيق فوراً</a>

              <div class="raw-data">
                  <strong>Raw Params:</strong><br>
                  ${JSON.stringify(queryParams, null, 2)}
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
  // 3. إنشاء الجلسة (POST) - مع طباعة أخطاء تفصيلية
  // ---------------------------------------------------------
  if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    // (DEBUG STEP 1)
    if (!publicKey || !apiPassword) {
        console.error('MISSING KEYS');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server Config Error: Keys missing in Netlify' }) };
    }

    let incomingData;
    try {
        incomingData = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
    }

    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    const config = ENDPOINTS[operation];
    
    if (!config) return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown operation: ${operation}` }) };

    // ... (نفس منطق التجهيز السابق) ...
    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]));
    }
    const { pathParams, queryParams, ...bodyData } = payload;
    if (queryParams) finalPath += `?${new URLSearchParams(queryParams).toString()}`;

    // التوقيع
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

    // (DEBUG STEP 2) Log outgoing request (without secrets)
    console.log(`Sending to Geidea [${config.host}]:`, finalBody.merchantReferenceId);

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
             // لو الرد مش JSON (مثلاً HTML error page من جيديا)
             console.error('Geidea Non-JSON Response:', body);
             resolve({ _statusCode: res.statusCode, error: 'Non-JSON response from Geidea', rawBody: body });
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
    console.error('Handler Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};