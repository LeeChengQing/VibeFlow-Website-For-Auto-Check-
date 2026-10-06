import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
]);

function isLoopback(host) {
  if (!host) return true;
  const cleanHost = host.replace(/^\[|\]$/g, '').split(':')[0].toLowerCase();
  return LOOPBACK_HOSTS.has(cleanHost);
}

export function installNetworkGuard() {
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;
  const originalNetConnect = net.Socket.prototype.connect;
  const originalFetch = globalThis.fetch;

  // Intercept http.request
  http.request = function (url, options, callback) {
    let host = 'localhost';
    if (typeof url === 'string') {
      try {
        host = new URL(url).hostname;
      } catch {}
    } else if (url && url.hostname) {
      host = url.hostname;
    } else if (options && (options.hostname || options.host)) {
      host = options.hostname || options.host;
    }

    if (!isLoopback(host)) {
      throw new Error(`Blocked external network call in test environment: ${host}`);
    }
    return originalHttpRequest.apply(this, arguments);
  };

  // Intercept https.request
  https.request = function (url, options, callback) {
    let host = 'localhost';
    if (typeof url === 'string') {
      try {
        host = new URL(url).hostname;
      } catch {}
    } else if (url && url.hostname) {
      host = url.hostname;
    } else if (options && (options.hostname || options.host)) {
      host = options.hostname || options.host;
    }

    if (!isLoopback(host)) {
      throw new Error(`Blocked external network call in test environment: ${host}`);
    }
    return originalHttpsRequest.apply(this, arguments);
  };

  // Intercept global fetch
  if (originalFetch) {
    globalThis.fetch = async function (input, init) {
      let host = 'localhost';
      if (typeof input === 'string') {
        try {
          host = new URL(input).hostname;
        } catch {}
      } else if (input && input.url) {
        try {
          host = new URL(input.url).hostname;
        } catch {}
      }

      if (!isLoopback(host)) {
        throw new Error(`Blocked external network call in test environment: ${host}`);
      }
      return originalFetch.apply(this, arguments);
    };
  }

  return {
    originalHttpRequest,
    originalHttpsRequest,
    originalNetConnect,
    originalFetch,
  };
}

export function restoreNetworkGuard(guard) {
  if (!guard) return;
  http.request = guard.originalHttpRequest;
  https.request = guard.originalHttpsRequest;
  net.Socket.prototype.connect = guard.originalNetConnect;
  if (guard.originalFetch) {
    globalThis.fetch = guard.originalFetch;
  }
}
