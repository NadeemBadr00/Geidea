const https = require('https');

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
    // 2. قراءة المفاتيح الجديدة (Public Key و Password)
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;

    // التحقق من وجود المفاتيح
    if (!publicKey || !apiPassword) {
      console.error('Missing configuration: Public Key or API Password not found.');
      throw new Error('خطأ في إعدادات السيرفر: مفاتيح الربط غير موجودة');
    }

    // 3. إنشاء كود المصادقة (Basic Auth)
    // Geidea تطلب: Basic Base64(PublicKey:Password)
    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    // 4. قراءة البيانات من الفرونت
    const data = JSON.parse(event.body);
    const amount = data.amount || 100;
    const currency = data.currency || 'SAR';

    console.log('جاري الاتصال بـ Geidea...', { amount, currency });

    // 5. إعداد الطلب
    const requestData = JSON.stringify({
      amount: amount,
      currency: currency,
      timestamp: new Date().toISOString()
      // أضف هنا callbackUrl إذا تطلبه الأمر
      // callbackUrl: "https://yoursite.com/callback"
    });

    const options = {
      hostname: 'api.geidea.net',
      path: '/pgw/api/v1/direct/session', // تأكد أن هذا هو المسار الصحيح لحسابك
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader, // استخدام الهيدر الذي أنشأناه
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const responseBody = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // التحقق من نجاح الطلب من وجهة نظر HTTP
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            // إذا ردت Geidea بخطأ، نعرضه
            console.error(`Geidea Error (${res.statusCode}):`, body);
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
    console.error('فشل إنشاء الجلسة:', error);
    
    // محاولة استخراج رسالة خطأ مفيدة
    let errorMessage = 'فشل الاتصال بالسيرفر';
    let errorDetails = error.message;

    // إذا كان الخطأ قادماً من Geidea (عبارة عن JSON) نحاول قراءته
    try {
        if (typeof error.message === 'string' && error.message.startsWith('{')) {
            const parsed = JSON.parse(error.message);
            errorDetails = parsed.detail || parsed.title || error.message;
        }
    } catch (e) {}

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: errorMessage,
        details: errorDetails
      })
    };
  }
};