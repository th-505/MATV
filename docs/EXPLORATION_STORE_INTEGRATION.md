# دمج قائمة الاستكشاف الخاصة — جاهز للمراجعة، غير مفعّل

## حالة قاعدة البيانات
تحقق الوكيل الرئيسي من قاعدة البيانات الحية: `mitv_library` محمي بسياسات ملكية وRLS، لكن قيد `kind` يسمح بـ`favorite` و`history` فقط. لم يُجر هذا العمل أي DDL أو كتابة بيانات حية.

`createSupabaseExplorationStore` يستعمل `kind='exploration'` حصريًا؛ لا يخلط قائمة الاستكشاف بالمفضلة أو السجل. يكون `configured=false` افتراضيًا، وتعيد المسارات المقترحة HTTP 503. قبل ضبط `EXPLORATION_LIBRARY_ENABLED=true` يجب إعداد migration إضافي يسمح بـ`exploration`، اختباره محليًا، ثم تطبيقه وفق مسار النشر. لا يكفي تغيير المتغير وحده.

## العقد

- `store.authenticate(authorization)` يتحقق من Bearer عبر `GET /auth/v1/user` في مشروع `SUPABASE_URL`، بمهلة ورفض التحويلات. لا يستخدم `getSession` أو فك JWT محليًا كإثبات هوية.
- يرجع جلسة طلب قصيرة العمر: `{userId,loadUser,saveUser}`. تأتي الهوية من `user.id` فقط؛ لا تعتمد على `user_id` المرسل من العميل.
- كل قراءة/تحديث مقيد بـ`user_id` و`kind=exploration` و`item_key` ذي بادئة مخصصة. تستخدم طلبات REST Bearer الخاص بالمستخدم أيضًا لتظل RLS طبقة تحقق إضافية.
- `saveUser` يكتب الفروق فقط، ويستخدم `sync_revision` شرطًا في التحديث. الحذف tombstone ولا يستعمل DELETE.
- التعارض يرجع `EXPLORATION_STORE_CONFLICT`، ويحتاج العميل إلى إعادة جلب الحالة وإعادة العملية المقصودة. لا تُعد كتابة snapshot قديم تلقائيًا.
- توفر الخدمة اتساقًا لكل صف عبر المقارنة بالإصدار. تعديل عدة صفوف يتم بطلبات مستقلة وليس معاملة ذرية؛ عمليات الواجهة المقترحة تعدل صفًا واحدًا.
- مفاتيح `SUPABASE_SECRET_KEY` أو `SUPABASE_SERVICE_ROLE_KEY` تبقى في الخادم. لا تُرسل إلى الواجهة ولا تستخرج منها مفتاح عميل.

## مثال دمج مسارات الخادم

هذا مثال للمراجعة **لم يُضف إلى app.mjs ولم يُفعّل في الموقع**. الدوال `sendJson` و`readBoundedJson` و`startPinnedDiscovery` تشير إلى تكامل المضيف المطلوب. يجب أن تقيد `readBoundedJson` الطلب إلى 8 KiB، وتتحقق من Content-Type وJSON وتلغي القراءة الزائدة.

```javascript
import { createSupabaseExplorationStore } from './exploration-store.mjs';
import { createExplorationLibrary } from './discovery-coordinator.mjs';

const explorationStore = createSupabaseExplorationStore();

// داخل معالج HTTP، بعد CORS وتحديد المعدل:
if (url.pathname === '/api/v1/exploration/library' ||
    url.pathname === '/api/v1/exploration/watch') {
  if (!explorationStore.configured) {
    return sendJson(req, res, 503, {
      status: 'unavailable', message: 'EXPLORATION_NOT_ENABLED'
    });
  }
  const watch = url.pathname.endsWith('/watch');
  if (watch ? req.method !== 'POST' : !['GET', 'POST', 'DELETE'].includes(req.method)) {
    return sendJson(req, res, 405, {status:'error',message:'METHOD_NOT_ALLOWED'});
  }
  try {
    // أنشئ جلسة adapter جديدة لكل طلب؛ لا تخزن Bearer في متغير مشترك.
    const session = await explorationStore.authenticate(req.headers.authorization);
    const library = createExplorationLibrary({
      loadUser: session.loadUser,
      saveUser: session.saveUser,
      enqueue: input => startPinnedDiscovery(input),
    });
    let data;
    if (req.method === 'GET') data = await library.list(session.userId);
    else {
      const input = await readBoundedJson(req, 8192);
      if (watch) data = await library.recordWatch(session.userId, input);
      else if (req.method === 'DELETE') data = await library.remove(session.userId, input);
      else data = await library.save(session.userId, input);
    }
    return sendJson(req,res,200,{status:'success',data});
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'AUTH_REQUIRED' ? 401 :
      code === 'EXPLORATION_STORE_CONFLICT' ? 409 :
      /^(INVALID_|EXPLORATION_ITEM_NOT_SAVED)/.test(code) ? 400 : 503;
    return sendJson(req,res,status,{status:'error',message:
      status === 401 ? 'AUTH_REQUIRED' : status === 409 ? 'REFRESH_AND_RETRY' :
      status === 400 ? 'INVALID_EXPLORATION_INPUT' : 'EXPLORATION_TEMPORARILY_UNAVAILABLE'});
  }
}
```

`startPinnedDiscovery` يجب أن يحترم مصدر المستخدم ومرجعه ولا يستبدله بمصدر آخر. لا تمرر مرجع مزود إلى منسق لا يقبل إلا مرجع TMDB. يجب تحويل المرجع عبر مسار المزود الصحيح، وإبقاء هوية المستخدم خارج مفتاح الوظيفة المشتركة.

## ما بقي في الواجهة والمشغل

1. إرسال Bearer المستخدم الحالي من جلسة Supabase الموجودة، دون إضافة أي مفتاح خادم إلى JavaScript.
2. أحداث save/remove/list تحفظ قائمة الاستكشاف. يبقى العمل محفوظًا بعد الخمول.
3. حدث المشاهدة يرسل `provider/ref/season/episode/position/playedSeconds/playing`؛ تُحسب الثواني من الوقت الفعلي أثناء التشغيل لا من فرق الموضع عند التقديم.
4. القراءة والزيارة والإيقاف لا تجدد مهلة 7 أيام. `refreshNeeded` يطلب إعادة القشط؛ لا يعني حذف العمل ولا تمديد صلاحية رابط موقّع منتهٍ.
5. تمييز HTTP 401 و409 و503 في الواجهة وعدم عرضها كقائمة فارغة.
6. إعداد migration واختبار RLS حي بعد نشره، ثم تمكين المتغير وتجربة أجهزة فعلية.

## التحقق القابل للتكرار

```bash
node --test tests/discovery-coordinator.test.mjs tests/exploration-library.test.mjs tests/exploration-store.test.mjs
```

النتيجة في 2026-10-24: **22 اختبارًا ناجحًا**، منها 9 اختبارات adapter بالبدائل المحلية؛ لا تدعي هذه الاختبارات تفعيل الاستكشاف أو الترحيل الحي.
