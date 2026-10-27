{{flutter_js}}
{{flutter_build_config}}
// Administration builds deliberately do not register an offline service worker.
_flutter.loader.load({
  config: {canvasKitBaseUrl: 'canvaskit/'},
  onEntrypointLoaded: async engine => {
    try {
      const runner = await engine.initializeEngine();
      await runner.runApp();
      document.getElementById('najd-loading')?.remove();
    } catch (_) {
      const status = document.getElementById('najd-loading');
      if (status) status.textContent = 'تعذر فتح نجد؛ أعد تحميل الصفحة وتحقق من الاتصال.';
    }
  }
});
