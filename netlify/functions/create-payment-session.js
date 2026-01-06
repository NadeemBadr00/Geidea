const https = require('https');
const crypto = require('crypto');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, updateDoc, increment, getDoc } = require("firebase/firestore");

// 1. إعدادات Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA6WQKgXjdqe3ghQEQ5EXAMZM7ffiWlabk",
  authDomain: "ai-roadmap-jnadeem.firebaseapp.com",
  projectId: "ai-roadmap-jnadeem",
  storageBucket: "ai-roadmap-jnadeem.firebasestorage.app",
  messagingSenderId: "332299268804",
  appId: "1:332299268804:web:225b27d243845688194f91",
  measurementId: "G-P8E119RZDX"
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // =================================================================
  // (GET) رابط الدفع المباشر (Direct Payment Link)
  // هذا الرابط ينشئ الجلسة ويوجه المستخدم فوراً لصفحة الدفع
  // =================================================================
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters || {};
    
    // 1. هل نحن عائدون من الدفع؟ (Callback)
    if (queryParams.responseCode) {
        return handlePaymentCallback(queryParams);
    }

    // 2. طلب دفع جديد (Initiate Payment)
    const amount = parseFloat(queryParams.amount);
    const userId = queryParams.userId;
    const email = queryParams.email || 'test@geidea-ksa.com';

    if (!amount || !userId) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: `<h1>خطأ: بيانات ناقصة (المبلغ أو المستخدم)</h1>`
        };
    }

    // إنشاء رابط العودة لنفس هذه الدالة (عشان نعالج النتيجة)
    // ملاحظة: في Netlify، رابط الوظيفة يكون في event.rawUrl أو بناءً على الدومين
    // هنا سنفترض أننا نعرف الرابط الأساسي، أو نستخرجه
    const currentUrl = `https://${event.headers.host}${event.path}`; // رابط الدالة الحالية
    const returnUrl = `${currentUrl}?userId=${userId}&amount=${amount}`; // نضيف البيانات لتعود إلينا

    try {
        // الاتصال بجيديا لإنشاء الجلسة (Server-to-Server)
        const session = await createGeideaSession(amount, 'SAR', email, returnUrl);
        
        if (session && session.id) {
            const redirectUrl = `https://www.ksamerchant.geidea.net/checkout/val/${session.id}`;
            
            // إعادة توجيه المستخدم لصفحة الدفع فوراً
            return {
                statusCode: 302,
                headers: {
                    'Location': redirectUrl,
                    'Cache-Control': 'no-cache'
                },
                body: ''
            };
        } else {
            throw new Error("فشل في الحصول على رقم الجلسة");
        }
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: `<h1>خطأ في بدء الدفع: ${err.message}</h1>`
        };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

// --- وظائف مساعدة ---

async function handlePaymentCallback(params) {
    const { responseCode, responseMessage, userId, amount } = params;
    const isSuccess = responseCode === '000' || responseCode === '0';
    
    let dbStatus = "لم يتم التحديث";

    if (isSuccess && userId && amount) {
        try {
            if (db) {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, { walletBalance: increment(parseFloat(amount)) });
                dbStatus = "تم شحن الرصيد بنجاح ✅";
            }
        } catch (e) {
            console.error(e);
            dbStatus = "خطأ في تحديث الرصيد ❌";
        }
    }

    const color = isSuccess ? '#10B981' : '#EF4444';
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>نتيجة الدفع</title>
          <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f4f4f9} .card{background:white;padding:40px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1);max-width:500px;margin:auto} h1{color:${color}}</style>
      </head>
      <body>
          <div class="card">
              <h1 style="font-size:50px">${isSuccess ? '✔' : '✖'}</h1>
              <h1>${isSuccess ? 'عملية ناجحة' : 'فشلت العملية'}</h1>
              <p>${responseMessage}</p>
              <p><strong>${dbStatus}</strong></p>
              <a href="rorkapp://" style="display:inline-block;margin-top:20px;padding:15px 30px;background:#333;color:white;text-decoration:none;border-radius:10px">العودة للتطبيق</a>
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

async function createGeideaSession(amount, currency, email, returnUrl) {
    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;
    
    const timestamp = new Date().toISOString();
    const merchantReferenceId = `REF-${crypto.randomUUID().substring(0,12)}`;
    
    // التوقيع
    const dataToSign = `${publicKey}${amount.toFixed(2)}${currency}${merchantReferenceId}${timestamp}`;
    const signature = crypto.createHmac('sha256', apiPassword).update(dataToSign).digest('base64');

    const payload = {
        amount, currency, merchantReferenceId, timestamp, signature,
        paymentOperation: "Pay",
        appearance: { uiMode: "hosted", showEmail: true },
        returnUrl: returnUrl,
        customer: { email }
    };

    const auth = Buffer.from(`${publicKey}:${apiPassword}`).toString('base64');

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.ksamerchant.geidea.net',
            path: '/payment-intent/api/v2/direct/session',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(json.session);
                    else reject(new Error(json.detailedResponseMessage || "API Error"));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}