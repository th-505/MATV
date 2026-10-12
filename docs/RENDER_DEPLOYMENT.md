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

سيُستخدم اتصال Render المباشر لإنشاء الخدمة. البديل اليدوي هو [فتح Blueprint من المستودع](https://dashboard.render.com/blueprint/new?repo=https://github.com/th-505/MATV). لا تطبق البديل لإنشاء خدمة ثانية إذا كانت الخدمة قد أُنشئت بالفعل عبر الاتصال.

إذا فضلت Node native بدل Docker: Build Command هو `npm ci --omit=dev`، وStart Command هو `node server/index-runtime.mjs`، مع `NODE_VERSION=24.19.0` ومجلد العمل في الجذر.

بحسب [وثائق Render Free](https://render.com/docs/free)، تتوقف الخدمة المجانية بعد 15 دقيقة بلا طلبات، وقد يستغرق الاستيقاظ بعض الوقت. تبقى البيانات في Supabase محفوظة بعد التوقف. طلبات الاستخراج والفهرسة تصل إلى الخادم، أما الفيديو فينتقل مباشرة بين العميل وCDN.

## التحقق من الخدمة

لا يُعتمد رابط متوقع بالاسم؛ يؤخذ الرابط العام الفعلي من خدمة Render ثم يُفحص:

1. اكتمال الـdeploy بحالة `live` وفحص `/health` يعيد 200.
2. `/api/v1/3isk/status` يعرض Supabase دون خطأ بعد إجراء طلب للمزود.
3. فهرسة `3isk-turkish`، وتفاصيل مسلسل، وحل الحلقة 187.
4. استخدام `refresh=1` مرة في التحقق لإثبات قدرة شبكة Render على استخراج رابط جديد، بدل الاكتفاء بكاش البيئة السابقة.
5. المانيفست ومقطع فيديو يعملان من خارج Render؛ لا تمر بايتات الفيديو عبر الخادم.

## نسخة Android

بعد التحقق من الرابط العام، شغّل GitHub Actions workflow **MATV Android trial** وضعه في input `api_base`.

```sh
gh workflow run mobile-trial.yml --repo th-505/MATV \
  -f api_base=https://ACTUAL-SERVICE.onrender.com
```

يستخدم البناء `--dart-define=MATV_API_BASE=<الرابط الفعلي>`. يجري التحليل والاختبارات، ويُتحقق من توقيع APK وصلاحية الإنترنت، ثم يرفع artifact باسم `MATV-Android-Trial` يتضمن APK وSHA-256 لمدة 14 يومًا. الرابط أعلاه مثال وليس عنوان خدمة منشأة.

## نسخة iPhone

APK لا يُثبت على آيفون. يلزم توقيع Apple وProvisioning وحساب Apple Developer ومسار TestFlight أو Ad Hoc وبناء على macOS. تشغيل الفيديو في Safari لا يوفر هذه المتطلبات تلقائيًا. لم تُرسل أسرار Supabase إلى تطبيق الهاتف، ولن تُستخدم كشهادات أو بيانات توقيع.

سيوثق هذا الملف معرّف الخدمة والرابط ونتائج التحقق عند اكتمال النشر الفعلي.
