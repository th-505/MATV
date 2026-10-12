# نشر MATV على Koyeb ونسخة تجربة الهاتف

## الإعداد الجاهز

المستودع `https://github.com/th-505/MATV`، الفرع `main`، ومجلد العمل **جذر المستودع**؛ ملف `package.json` وملف القفل وDockerfile فيه، وليس في `server/`.

| الإعداد | القيمة |
| --- | --- |
| النوع | Web Service |
| البناء المفضل | Docker، باستخدام `Dockerfile` في الجذر |
| أمر التشغيل | `node server/index-runtime.mjs`، محدد بالفعل في Dockerfile |
| منفذ HTTP | `8000` |
| متغير PORT | `8000` |
| المسار العام | `/` إلى المنفذ `8000` |
| فحص الصحة | HTTP `/health` على المنفذ `8000` |
| الحجم المطلوب | `free` فقط |
| المنطقة | Frankfurt (`fra`) أو Washington (`was`) بحسب التوفر |
| NODE_ENV | `production` |
| SUPABASE_URL | `https://roqccichwszxamdpvhli.supabase.co` |
| SUPABASE_SECRET_KEY | مرجع إلى Secret خاص في Koyeb؛ القيمة لا توجد في Git |

إذا اخترت Buildpack بدل Docker، استخدم `npm ci --omit=dev` للبناء و`node server/index-runtime.mjs` للتشغيل، مع Node 24. لا تضبط Working Directory على `server/`.

صورة Docker تستخدم Node `24.19.0`، وتثبت تبعيات الإنتاج من ملف القفل، وتنسخ مجلد `server` فقط، وتعمل كمستخدم `node` بدل root. لا تحتوي أسرار البيئة أو ملفات Flutter أو Playwright. يوجد فحص صحة داخل الصورة أيضًا.

## حدود الخطة المجانية

بحسب [وثائق Koyeb الحالية](https://www.koyeb.com/docs/reference/instances)، توجد Free Instance واحدة لكل organization، بذاكرة 512MB و0.1 vCPU و2GB تخزين مؤقت. هي Web Service في منطقة واحدة، دون Volumes أو إعداد Scaling مخصص، وتنام بعد ساعة دون طلبات. الكاش الدائم في Supabase يُسترجع بعد استيقاظها.

لن يتحول هذا الإعداد إلى حجم مدفوع تلقائيًا عند عدم توفر Free Instance. متطلبات إنشاء الحساب والتحقق والدفع تُحسم داخل حساب Koyeb؛ لم يُتحقق منها دون الوصول إليه.

## ربط GitHub

في لوحة Koyeb اختر Create Service ثم GitHub، وامنح تطبيق Koyeb الوصول إلى `th-505/MATV` إذا طلب الربط. اختر `main` وDockerfile من الجذر، ثم الإعدادات أعلاه. أضف Supabase Secret من لوحة Secrets واربطه بمتغير الخادم فقط.

يمكن تنفيذ النشر أيضًا بواسطة Koyeb CLI. فُحصت الخيارات التالية مقابل الإصدار `5.12.0`:

```sh
koyeb apps create matv

# اقرأ قيمة Supabase من الإدخال، دون وضعها في أمر أو ملف في المستودع.
koyeb secrets create matv-supabase-key --value-from-stdin

koyeb services create api \
  --app matv \
  --git github.com/th-505/MATV \
  --git-branch main \
  --git-builder docker \
  --git-docker-dockerfile Dockerfile \
  --instance-type free \
  --regions fra \
  --ports 8000:http \
  --routes /:8000 \
  --checks 8000:http:/health \
  --env PORT=8000 \
  --env NODE_ENV=production \
  --env SUPABASE_URL=https://roqccichwszxamdpvhli.supabase.co \
  --env 'SUPABASE_SECRET_KEY={{secret.matv-supabase-key}}'
```

هذه أوامر إنشاء موارد جديدة. قبل تنفيذها افحص Apps وServices وSecrets لتجنب الاصطدام بموارد موجودة أو Free Instance مستخدمة. CLI يحتاج اتصال الحساب أو API token. لا تضع التوكن أو Supabase key في README أو Dockerfile أو APK. [وثائق نشر Git](https://www.koyeb.com/docs/build-and-deploy/deploy-with-git).

## التحقق بعد ظهور الرابط العام

من رابط الخدمة الفعلي، افحص:

1. `/health`: HTTP 200.
2. `/api/v1/3isk/status`: `storage: "supabase"` و`storage_error: null` بعد طلب بيانات من المزود.
3. `/api/v1/category?ref=3isk-turkish&p=1`: قائمة مسلسلات.
4. تفاصيل مسلسل ثم حل الحلقة 187 عبر `/api/cinema/details?ref=3isk:...`: رابط direct غير منتهٍ؛ لا تنشر قيمة التوكن في تقرير النشر.
5. الطلب الثاني وإعادة تشغيل الخدمة يعيدان رابطًا محفوظًا صالحًا مع `cached: true`.
6. تشغيل المانيفست ومقطع من شبكة خارج Koyeb. يجب إعادة هذا الفحص من خروج Koyeb الفعلي؛ اختبار البيئة السابقة لا يثبت إمكانية وصول منطقة الاستضافة إلى المصدر.

لا يُستبدل الرابط العام بتخمين اسم `*.koyeb.app`. يُؤخذ من الخدمة التي أنشأتها المنصة ثم يُختبر.

## بناء نسخة Android التجريبية

أُضيف workflow يدوي باسم **MATV Android trial** في `.github/workflows/mobile-trial.yml`. بعد التحقق من رابط Koyeb شغّله من GitHub Actions، وضع الرابط في input `api_base`.

يستخدم Flutter `3.47.7` وملف القفل، وينشئ منصة Android ويطبق هوية التطبيق الحالية، ثم يحلل الكود ويشغل الاختبارات ويبني:

أُصلح تجهيز Android ليضيف `android.permission.INTERNET` إلى ملف Release الرئيسي مرة واحدة، وفُحص ذلك على قالب Android مولد فعليًا. يتحقق workflow من الصلاحية داخل APK بالإضافة إلى صحة التوقيع قبل رفع الحزمة.

```sh
flutter build apk --release \
  --dart-define=AL_QAHTANI_TARGET=mobile \
  --dart-define=MATV_API_BASE=https://ACTUAL-SERVICE.koyeb.app
```

القيمة أعلاه مثال ويجب استبدالها بالرابط المختبر. لا يُضمَّن Supabase Secret في التطبيق. الناتج artifact باسم `MATV-Android-Trial` يحوي APK وSHA-256 ويُحتفظ به 14 يومًا. يستخدم هذا البناء توقيع التجربة الافتراضي الناتج عن قالب Flutter، وليس إعداد توقيع متجر نهائيًا.

إذا كانت النسخة المطلوبة للآيفون، فإن APK لا يعمل عليه. يلزم حساب Apple Developer وشهادات التوقيع وProvisioning وبناء macOS ومسار TestFlight أو توزيع Ad Hoc؛ لم تُفترض هذه الإعدادات أو تُنشأ دون توفرها.

## ما تم التحقق منه في هذه البيئة

- بُني Dockerfile بنجاح، مع تمرير CA الخاصة ببروكسي البيئة كـBuildKit secret مؤقت لا يُنسخ إلى الصورة.
- بدأت الحاوية على المنفذ `8000`، وأعاد `/health` HTTP 200 وأصبح Docker healthcheck `healthy`.
- استخدمت الحاوية Supabase الفعلي واسترجعت رابط الحلقة المحفوظ مع `cached: true` و`playback_mode: "direct"`، دون خطأ تخزين.
- المستخدم داخل الحاوية UID 1000، ولا يوجد `/app/.env` أو Flutter أو Playwright داخل الصورة.
- فُحص بناء YAML للـworkflow. لم يُشغّل بناء APK دون رابط Koyeb فعلي، ولم يُنشأ رابط خدمة عام قبل وجود وصول إلى الحساب.
