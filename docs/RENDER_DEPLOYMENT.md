# نشر MATV على Render ونسخة التجربة

المصدر `https://github.com/th-505/MATV`، الفرع `main`، وWorking Directory هو **جذر المستودع**. لا تستخدم `server/` كمجلد العمل لأن `package.json` وملف القفل وDockerfile في الجذر.

## إعداد الخدمة المجانية

- النوع: Web Service، runtime: Docker.
- البناء: `Dockerfile`، context: `.`.
- التشغيل: `node server/index-runtime.mjs`، محدد في CMD للصورة.
- الخطة: `free`، المنطقة: Frankfurt.
- `PORT=10000` و`NODE_ENV=production`. الخادم يستمع إلى `0.0.0.0:$PORT`.
- HTTP health check: `/health` إذا استُخدم Blueprint؛ وفي جميع الحالات يجب فحصه بعد النشر.
- `SUPABASE_URL=https://roqccichwszxamdpvhli.supabase.co`.
- `SUPABASE_SECRET_KEY`: يُضاف كسر خدمة عبر الاتصال أو Dashboard فقط. لا توجد قيمته في Git أو Dockerfile أو APK.

أُضيف `render.yaml` وفُحص مقابل [مخطط Render الرسمي](https://render.com/schema/render.yaml.json). يحدد الخطة المجانية والمتغيرات، ويطلب قيمة Supabase Secret باستخدام `sync: false` عند إنشاء Blueprint.

أُنشئت الخدمة بالفعل عبر اتصال Render المباشر. البديل اليدوي هو [فتح Blueprint من المستودع](https://dashboard.render.com/blueprint/new?repo=https://github.com/th-505/MATV). لا تطبق البديل لإنشاء خدمة ثانية إذا كانت الخدمة قد أُنشئت بالفعل عبر الاتصال.

إذا فضلت Node native بدل Docker: Build Command هو `npm ci --omit=dev`، وStart Command هو `node server/index-runtime.mjs`، مع `NODE_VERSION=24.19.0` ومجلد العمل في الجذر.

بحسب [وثائق Render Free](https://render.com/docs/free)، تتوقف الخدمة المجانية بعد 15 دقيقة بلا طلبات، وقد يستغرق الاستيقاظ بعض الوقت. تبقى البيانات في Supabase محفوظة بعد التوقف. طلبات الاستخراج والفهرسة تصل إلى الخادم، أما الفيديو فينتقل مباشرة بين العميل وCDN.

## التحقق من الخدمة

لا يُعتمد رابط متوقع بالاسم؛ يؤخذ الرابط العام الفعلي من خدمة Render ثم يُفحص:

1. اكتمال الـdeploy بحالة `live` وفحص `/health` يعيد 200.
2. `/api/v1/3isk/status` يعرض Supabase دون خطأ بعد إجراء طلب للمزود.
3. فهرسة `3isk-turkish`، وتفاصيل مسلسل، وحل الحلقة 187.
4. استخدام `refresh=1` مرة في التحقق لإثبات قدرة شبكة Render على استخراج رابط جديد، بدل الاكتفاء بكاش البيئة السابقة.
5. المانيفست ومقطع فيديو يعملان من خارج Render؛ لا تمر بايتات الفيديو عبر الخادم.

## النشر الفعلي — 2026-10-12

- مساحة العمل المؤكدة: **MATV** (`tea-db6l0m5g1s2s739p49c0`).
- الخدمة: **MATV** (`srv-db6l1pd9fdbs73b02j40`).
- API: **https://matv.onrender.com**؛ [فحص الصحة](https://matv.onrender.com/health).
- [لوحة الخدمة](https://dashboard.render.com/web/srv-db6l1pd9fdbs73b02j40).
- الإصدار المشترك للخادم والتطبيقات: **1.0.35، build 35**. نشر الخادم من `3c651a538a8ca4c6704b250054a3c2ac9154b78a`، وبناء الأجهزة الثلاث من `1f6bbe372382c71d618158682cebca00892ea161`؛ التعديلات بينهما تخص توثيق النشر وفحوص/إعدادات CI فقط، دون تغيير كود المنتج.
- deploy `dep-db6l96u7bikc73c75m1g` بحالة `live`.
- أُضيفت أسرار Supabase إلى الخدمة؛ لا تدخل التطبيق أو صورة Docker أو Git.

نجح `scripts/deployment_smoke.mjs` على الرابط العام: صحة الخادم، فهرس 28 مسلسلًا، استخراج جديد باستخدام `refresh=1` من شبكة Render، حفظ Supabase واسترجاع الكاش، وتحميل مانيفست HLS ومقطع فيديو من خارج Render (206). لم تُسجل روابط التوكن الكاملة. استُخدم fallback يستخرج معرّف الحلقة من بيانات الصفحة الفعلية إذا أعاد مسار `/see/` توجيهًا إلى التفاصيل؛ لا توجد معرّفات حلقات مثبتة داخل المزود. أُوقفت diagnostics بعد التحقيق.

## النسخ الثلاث المطلوبة

Workflow **MATV device trials** يبني النسخ من commit واحد ويربطها بالعنوان الفعلي:

```sh
gh workflow run mobile-trial.yml --repo th-505/MATV \
  -f api_base=https://matv.onrender.com
```

| الجهاز | المعمارية | الملف |
| --- | --- | --- |
| أندرويد موبايل | ARM64 / arm64-v8a | MATV-Android-Mobile-ARM64.apk |
| أندرويد TV / Google TV | ARM32 / armeabi-v7a | MATV-Android-TV-ARM32.apk |
| آيفون | ARM64، غير موقّع | MATV-iPhone-Unsigned.ipa |

Android: build الأساسي 35؛ يضيف Flutter رقم المعمارية عند فصل APK، فيكون Android versionCode للموبايل 2035 ولـTV 1035، وversionName لكليهما 1.0.35. التحليل والاختبارات، بناء release، فحص توقيع APK وصلاحية الإنترنت والمعمارية؛ نسخة TV تضيف Leanback وتزيل اشتراط شاشة اللمس. APK موقّع بشهادة البناء التجريبية؛ إصدار المتجر يحتاج مفتاح توقيع إصدار ثابت.

iPhone: بناء macOS بـ `--no-codesign`، تغليف `Payload/Runner.app` داخل IPA، إزالة توقيع التطبيق وملف provisioning إن وُجدا، والتحقق من ARM64. **يلزم توقيع IPA خارجيًا قبل تثبيتها** كما طلب المستخدم؛ لا يلزم تسليم بيانات Apple لهذا البناء غير الموقّع.

كل artifact يتضمن الملف وSHA-256 ويُحفظ في Actions مدة 14 يومًا. [تشغيل بناء الإصدار 35](https://github.com/th-505/MATV/actions/runs/38313378978).
