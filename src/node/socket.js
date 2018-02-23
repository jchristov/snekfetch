'use strict';

const tls = require('tls');
const http = require('http');
const https = require('https');
// lazy require http2 because it emits a warning
let http2;

const hasHttp2 = require('repl')._builtinLibs.includes('http2');
const ALPNProtocols = hasHttp2 ? ['h2', 'http/1.1'] : ['http/1.1'];

function connectHttp(opt) {
  const req = http.request(opt);
  return Promise.resolve({ req });
}

function connectHttps(opt) {
  return new Promise((resolve, reject) => {
    const port = opt.port = +opt.port || 443;
    const socket = tls.connect({
      host: opt.host,
      port,
      servername: opt.host,
      ALPNProtocols,
    });
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      switch (socket.alpnProtocol) {
        case 'http/1.1': {
          const req = https.request(Object.assign({
            createConnection: () => socket,
          }, opt));
          resolve({ req });
          break;
        }
        case 'h2': {
          if (http2 === undefined)
            http2 = require('http2');

          const connection = http2.connect({
            host: opt.host,
            port,
          }, {
            createConnection: () => socket,
          });

          const req = connection.request(Object.assign({
            ':path': opt.path,
            ':method': opt.method,
            ':authority': opt.host,
          }, opt.headers));
          resolve({ req, http2: true });
          break;
        }
        default:
          reject(new Error('No supported ALPN protocol was negotiated'));
          break;
      }
    });
  });
}

module.exports = (options) =>
  (options.protocol === 'https:' ? connectHttps : connectHttp)(options);
