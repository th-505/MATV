import http from 'node:http';
import https from 'node:https';

const failNetwork = () => {
  throw new Error('UNEXPECTED_EXTERNAL_NETWORK_REQUEST_IN_FIXTURE_TEST');
};

globalThis.fetch = async () => failNetwork();
http.request = failNetwork;
http.get = failNetwork;
https.request = failNetwork;
https.get = failNetwork;
