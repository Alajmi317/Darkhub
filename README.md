# DarkHub (Prototype)

نسخة أولية لمشروع DarkHub كـ Web App:
- صورة -> PDF (A4)
- صورة -> A4 PNG (contain/cover + DPI)
- فلتر أزرق + تصدير PNG

## التشغيل
1) أنشئ مجلد `darkhub`
2) ضع الملفات:
- index.html
- styles.css
- app.js
- README.md

3) افتح `index.html` مباشرة بالمتصفح.

## ملاحظات
- أداة PDF تستخدم مكتبة jsPDF عبر CDN.
- كل المعالجة تتم محلياً داخل الجهاز (Canvas).
- إذا تريد “تطبيق” لاحقاً: تقدر تحوله WebView بسهولة.

## أفكار تطوير سريع (Next)
- دمج أكثر من صورة في PDF متعدد الصفحات.
- أداة ضغط الصور وتغيير الصيغة (PNG/JPG/WebP).
- قص يدوي (Crop) بواجهة سحب.
- حفظ إعدادات المستخدم (LocalStorage).
