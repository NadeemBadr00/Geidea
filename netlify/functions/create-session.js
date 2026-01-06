const https = require('https');
const crypto = require('crypto'); // مكتبة لتوليد رقم طلب عشوائي

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
    // 2. قراءة المفاتيح
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    if (!publicKey || !apiPassword) {
      throw new Error('مفاتيح الربط غير موجودة في إعدادات Netlify');
    }

    // 3. التجهيز للمصادقة
    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    // 4. قراءة البيانات وتجهيز Order ID (الحل لمشكلة 502)
    const data = JSON.parse(event.body);
    
    // تحويل المبلغ لرقم صحيح (تجنباً لأي مشاكل في الصيغة)
    const amount = parseFloat(data.amount) || 100;
    
    // تحديد العملة: إذا لم يحددها الفرونت إند، نستخدم الجنيه المصري
    const currency = data.currency || 'EGP'; 
    
    // توليد رقم طلب فريد (مهم جداً لـ Geidea)
    const orderId = data.orderId || crypto.randomUUID();

    console.log(`بدء طلب دفع جديد: ${amount} ${currency} | OrderID: ${orderId}`);

    // 5. جسم الطلب (Payload)
    // أضفنا orderId لأنه إجباري في بعض التحديثات
    const requestData = JSON.stringify({
      amount: amount,
      currency: currency,
      orderId: orderId,
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: 'api.geidea.net',
      path: '/pgw/api/v1/direct/session',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': Buffer.byteLength(requestData)
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
            console.error(`خطأ من جييديا (${res.statusCode}):`, body);
            // نمرر الخطأ كما هو لنفهمه
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
    console.error('فشل العملية:', error);
    
    // تنظيف رسالة الخطأ للعرض
    let details = error.message;
    try {
        if (details.includes('DOCTYPE')) details = 'Geidea Server Error (Bad Gateway)';
    } catch(e) {}

    return {
      statusCode: error.statusCode || 500,
      headers,
      body: JSON.stringify({
        error: 'فشل إنشاء الجلسة',
        details: details
      })
    };
  }
};