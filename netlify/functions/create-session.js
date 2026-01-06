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
      throw new Error('Missing Keys in Netlify Environment Variables');
    }

    // تجهيز Basic Auth
    // يقوم بدمج المفتاحين وتشفيرهما base64 كما في التوثيق
    const authString = `${publicKey}:${apiPassword}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const body = JSON.parse(event.body);
    const amount = parseFloat(body.amount) || 100;
    const currency = body.currency || 'SAR';
    
    // توليد رقم مرجعي فريد
    const merchantReferenceId = body.merchantReferenceId || `ORD-${crypto.randomUUID().substring(0, 15)}`;
    
    // تنسيق التاريخ (Timestamp)
    // نستخدم ISO String لأنه المعيار الأكثر قبولاً
    const timestamp = new Date().toISOString();

    // ---------------------------------------------------------
    // حساب التوقيع الإلكتروني (Signature) - V2 Requirement
    // المعادلة القياسية: PublicKey + Amount (2 decimals) + Currency + MerchantReferenceId + Timestamp
    // ---------------------------------------------------------
    const amountStr = amount.toFixed(2); // لازم يكون رقمين عشريين بالضبط (مثلاً 100.00)
    const dataToSign = `${publicKey}${amountStr}${currency}${merchantReferenceId}${timestamp}`;
    
    const signature = crypto.createHmac('sha256', apiPassword)
                            .update(dataToSign)
                            .digest('base64');

    const returnUrl = "https://geideaa.netlify.app/"; // رابط العودة لموقعك
    const callbackUrl = "https://geideaa.netlify.app/";

    // تجهيز البيانات (Payload) لتتطابق تماماً مع مثال Documentation V2
    const requestData = JSON.stringify({
      amount: amount,
      currency: currency,
      timestamp: timestamp,
      merchantReferenceId: merchantReferenceId,
      signature: signature,
      paymentOperation: "Pay",
      appearance: {
        uiMode: "modal" // كما في المثال
      },
      language: "en",
      callbackUrl: callbackUrl,
      returnUrl: returnUrl,
      // بيانات العميل (إجبارية أحياناً في V2، نضع بيانات افتراضية إذا لم تتوفر)
      customer: {
        email: "customer@email.com",
        phoneNumber: "+966500000000",
        phoneCountryCode: "+966"
      },
      initiatedBy: "Internet" // كما في المثال
    });

    console.log(`Sending V2 Request to Geidea:`, requestData);

    const options = {
      hostname: 'api.ksamerchant.geidea.net',
      path: '/payment-intent/api/v2/direct/session', // رابط V2
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
            console.error(`Geidea V2 Error (${res.statusCode}):`, body);
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
    console.error('Function Error:', error);
    
    // محاولة تحسين رسالة الخطأ القادمة من Geidea
    let errorDetail = error.message;
    try {
        const parsed = JSON.parse(error.message);
        if(parsed.detailedResponseMessage) errorDetail = parsed.detailedResponseMessage;
    } catch(e) {}

    return {
      statusCode: error.statusCode || 500,
      headers,
      body: JSON.stringify({
        error: 'فشل الاتصال بـ V2',
        details: errorDetail
      })
    };
  }
};