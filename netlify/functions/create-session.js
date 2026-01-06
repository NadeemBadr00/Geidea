const https = require('https');
const crypto = require('crypto');

// --- قاعدة بيانات الروابط (Endpoints Map) ---
const ENDPOINTS = {
  // === Checkout V2 ===
  'createSession': { 
    path: '/payment-intent/api/v2/direct/session', 
    method: 'POST', 
    host: 'api.ksamerchant.geidea.net', 
    sign: true 
  },
  // ... (باقي العمليات كما هي) ...
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  // 1. التعامل مع طلبات الـ OPTIONS (CORS)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // ---------------------------------------------------------
  // 2. (جديد) التعامل مع الـ GET: صفحة إعادة التوجيه (Redirect Page)
  // ---------------------------------------------------------
  if (event.httpMethod === 'GET') {
    // استلام البيانات اللي راجعة من جيديا (כمثل responseCode, orderId, etc.)
    const queryParams = event.queryStringParameters || {};
    
    // تحويل البيانات لنص عشان نضيفها للرابط
    const queryString = new URLSearchParams(queryParams).toString();
    
    // رابط التطبيق (Deep Link)
    // بنضيف platform=geidea عشان التطبيق يعرف إن ده رد من جيديا
    const appDeepLink = `rorkapp://payment-status?platform=geidea&${queryString}`;

    // صفحة HTML بسيطة بتعمل توجيه تلقائي
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>جاري العودة للتطبيق...</title>
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .loader { border: 4px solid #f3f3f3; border-top: 4px solid #10B981; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              .btn { margin-top: 20px; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
          </style>
          <script>
              window.onload = function() {
                  // محاولة التوجيه التلقائي
                  window.location.href = "${appDeepLink}";
                  
                  // لو فشل التوجيه التلقائي بعد ثانية، نوضحه للمستخدم
                  setTimeout(function() {
                      document.getElementById('manual-link').style.display = 'block';
                  }, 1000);
              };
          </script>
      </head>
      <body>
          <div class="loader"></div>
          <h3>جاري إعادتك للتطبيق...</h3>
          <p style="color: #666;">تمت معالجة العملية، يرجى الانتظار.</p>
          
          <a id="manual-link" href="${appDeepLink}" class="btn" style="display: none;">اضغط هنا للعودة</a>
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
  // 3. التعامل مع الـ POST: إنشاء الجلسة (Proxy Logic)
  // ---------------------------------------------------------
  if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) throw new Error('Missing Keys in Netlify');

    const incomingData = JSON.parse(event.body);
    const operation = incomingData.operation || 'createSession';
    const payload = incomingData.payload || {};
    
    // ... (باقي كود التوقيع والاتصال بجيديا كما هو بدون تغيير) ...
    // لقد قمت بنسخ الجزء الخاص بالمنطق فقط، الكود الأصلي للاتصال بجيديا سيبقى كما هو في الأسفل
    
    const config = ENDPOINTS[operation];
    if (!config) throw new Error(`Unknown operation: ${operation}`);

    let finalPath = config.path;
    if (payload.pathParams) {
        Object.keys(payload.pathParams).forEach(key => {
            finalPath = finalPath.replace(`{${key}}`, payload.pathParams[key]);
        });
    }
    const { pathParams, queryParams, ...bodyData } = payload;

    if (queryParams) {
        const query = new URLSearchParams(queryParams).toString();
        finalPath += `?${query}`;
    }

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
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};