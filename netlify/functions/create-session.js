<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تجربة دفع جييديا</title>
    
    <!-- مكتبة جييديا للسيرفر السعودي -->
    <script src="https://ksamerchant.geidea.net/payment-intent/online/v1/geidea-checkout.min.js"></script>
    
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f9; }
        .card { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }
        button { background-color: #00d082; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 5px; cursor: pointer; transition: background 0.3s; width: 100%; font-weight: bold; }
        button:hover { background-color: #00a86b; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        #status { margin-top: 15px; font-size: 14px; color: #555; }
        .error { color: red; }
    </style>
</head>
<body>

    <div class="card">
        <h2>دفع إلكتروني</h2>
        <p>المبلغ: <strong>100.00 SAR</strong></p>
        <button id="payBtn" onclick="initiatePayment()">ادفع الآن</button>
        <div id="status"></div>
    </div>

    <script>
        async function initiatePayment() {
            const btn = document.getElementById('payBtn');
            const status = document.getElementById('status');
            
            btn.disabled = true;
            btn.innerText = "جاري الاتصال...";
            status.innerHTML = "";
            status.className = "";

            try {
                // 1. طلب إنشاء الجلسة من الباك إند
                console.log("جاري طلب الجلسة...");
                const response = await fetch('/.netlify/functions/create-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        amount: 100, 
                        currency: "SAR" 
                    })
                });

                const data = await response.json();
                console.log("رد السيرفر الكامل:", data); // هام جداً للتنقيح

                if (!response.ok) {
                    throw new Error(data.details || data.error || "فشل الاتصال بالسيرفر");
                }

                // 2. استخراج رقم الجلسة بذكاء (الحل للمشكلة الحالية)
                let sessionId = null;
                
                if (data.session && data.session.id) {
                    sessionId = data.session.id; // الهيكل المعتاد للسيرفر السعودي
                } else if (data.id) {
                    sessionId = data.id; // هيكل بديل
                }

                if (!sessionId) {
                    console.error("البيانات المستلمة لا تحتوي على رقم جلسة:", data);
                    throw new Error("لم يتم استلام رقم الجلسة (Session ID) من السيرفر. راجع الكونسول للتفاصيل.");
                }

                console.log("تم استلام رقم الجلسة بنجاح:", sessionId);
                status.innerText = "تم استلام الجلسة، جاري فتح نافذة الدفع...";

                // 3. فتح نافذة الدفع الخاصة بـ Geidea
                const payment = new GeideaCheckout(onPaymentSuccess, onPaymentError, onPaymentCancel);
                
                payment.startPayment(sessionId);
                
                btn.innerText = "ادفع الآن";
                btn.disabled = false;

            } catch (error) {
                console.error("خطأ:", error);
                status.innerText = "خطأ: " + error.message;
                status.className = "error";
                btn.disabled = false;
                btn.innerText = "حاول مرة أخرى";
            }
        }

        // دوال الاستجابة (Callbacks)
        function onPaymentSuccess(data) {
            console.log("نجاح الدفع:", data);
            document.getElementById('status').innerText = "تمت عملية الدفع بنجاح! ✅";
            document.getElementById('status').style.color = "green";
        }

        function onPaymentError(error) {
            console.log("فشل الدفع:", error);
            document.getElementById('status').innerText = "فشلت عملية الدفع ❌";
            document.getElementById('status').className = "error";
        }

        function onPaymentCancel() {
            console.log("إلغاء الدفع");
            document.getElementById('status').innerText = "تم إلغاء العملية";
        }
    </script>

</body>
</html>