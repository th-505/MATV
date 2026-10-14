// Compatibility tombstone for previously deployed web clients.
// Protected Alooy video is delivered only through a device-local bridge.
export function createAlooyWebBridge() {
  return {
    register() { throw Error('CLOUD_MEDIA_PROXY_RETIRED'); },
    async proxy(_req, res) {
      res.statusCode = 410;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ status:'error', message:'MEDIA_PROXY_RETIRED_USE_DIRECT_PLAYBACK', media_proxy:false }));
    },
  };
}
