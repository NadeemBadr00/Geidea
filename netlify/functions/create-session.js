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
      throw new Error('مفاتيح الربط غير موجودة');
    }

    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const data = JSON.parse(event.body);
    const amount = parseFloat(data.amount) || 100;
    
    // ملاحظة: السيرفر هو ksamerchant، لذا العملة الافتراضية يجب أن تكون ريال سعودي
    const currency = data.currency || 'SAR'; 
    const orderId = data.orderId || `ORD-${crypto.randomUUID()}`; // توليد رقم طلب

    // رابط العودة (يمكنك تغييره لرابط موقعك الحقيقي)
    // في ملف البايثون كان يستخدم ngrok، هنا سنستخدم رابط الموقع نفسه كإجراء مؤقت
    const returnUrl = data.returnUrl || "https://geideaa.netlify.app/";

    console.log(`اتصال بالسيرفر السعودي: ${amount} ${currency} | Ref: ${orderId}`);

    // 2. تحديث هيكل البيانات حسب ملف Python (API v1 Direct Session)
    const requestData = JSON.stringify({
      amount: amount,
      currency: currency,
      merchantReferenceId: orderId, // هذا الاسم الصحيح حسب ملفك
      paymentOperation: "Pay",      // حقل إضافي ضروري
      callbackUrl: returnUrl,       // مطلوب
      returnUrl: returnUrl,         // مطلوب
      timestamp: new Date().toISOString()
    });

    const options = {
      // 3. التغيير الجذري: استخدام الرابط السعودي KSA Merchant
      hostname: 'api.ksamerchant.geidea.net', 
      path: '/payment-intent/api/v1/direct/session', // المسار الصحيح من ملفك
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
            console.error(`خطأ من جييديا KSA (${res.statusCode}):`, body);
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
    
    // تحسين رسالة الخطأ
    let details = error.message;
    try {
        if (typeof details === 'string' && details.includes('DOCTYPE')) {
             details = 'Geidea Server Error (Bad Gateway/HTML Response)';
        }
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