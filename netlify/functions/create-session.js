const https = require('https');
const crypto = require('crypto');

exports.handler = async (event, context) => {
  // 1. إعدادات CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) {
      throw new Error('Missing Keys');
    }

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const data = JSON.parse(event.body);
    const amount = parseFloat(data.amount) || 100;
    const currency = data.currency || 'SAR';
    
    // توليد رقم طلب عشوائي يبدأ بـ ORD- مثل كود البايثون
    const orderId = `ORD-${crypto.randomUUID().substring(0, 8)}`;
    
    // رابط العودة (استخدمنا رابط موقعك بدلاً من ngrok)
    const returnUrl = "https://geideaa.netlify.app/";

    // 2. تجهيز البيانات (مطابق تماماً لملف test.py)
    // حذفنا timestamp وأي حقول إضافية
    const requestData = JSON.stringify({
      amount: amount,
      currency: currency,
      merchantReferenceId: orderId, // هذا الحقل مهم جداً
      callbackUrl: returnUrl,
      returnUrl: returnUrl,
      paymentOperation: "Pay"
    });

    console.log(`Sending Payload:`, requestData);

    const options = {
      hostname: 'api.ksamerchant.geidea.net', // السيرفر السعودي
      path: '/payment-intent/api/v1/direct/session',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': Buffer.byteLength(requestData),
        'User-Agent': 'Nodejs-Netlify-Client' // إضافة هوية للمتصفح
      }
    };

    const responseBody = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            console.error(`Geidea Error Status: ${res.statusCode}`);
            console.error(`Geidea Error Body: ${body}`);
            reject({ statusCode: res.statusCode, message: body });
          }
        });
      });

      req.on('error', (err) => {
        console.error('Network Error:', err);
        reject(err);
      });

      req.write(requestData);
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error('Final Error Catch:', error);
    
    let details = error.message;
    // تنظيف رسالة الـ HTML الطويلة إذا ظهرت
    if (typeof details === 'string' && details.includes('DOCTYPE')) {
         details = 'Geidea Gateway Error (502) - Check Logs for Payload';
    }

    return {
      statusCode: error.statusCode || 500,
      headers,
      body: JSON.stringify({
        error: 'فشل الاتصال',
        details: details
      })
    };
  }
};