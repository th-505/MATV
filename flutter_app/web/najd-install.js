// Installation always requires a user gesture. Safari exposes no install prompt API.
(() => {
  let pending = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pending = event;
  });
  window.addEventListener('appinstalled', () => { pending = null; });
  window.najdRequestInstall = () => {
    if (!pending) return false;
    const prompt = pending;
    pending = null;
    Promise.resolve(prompt.prompt()).catch(() => {});
    return true;
  };
})();
