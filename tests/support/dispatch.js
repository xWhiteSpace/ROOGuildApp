import { EventEmitter } from 'node:events';

/** Invoke an Express app or Router without listening on a port. */
export function dispatch(app, { method = 'GET', path = '/', headers = {}, query = {}, body, session } = {}) {
  return new Promise((resolve, reject) => {
    const qIndex = String(path).indexOf('?');
    let pathname = path;
    let search = '';
    if (qIndex >= 0) {
      pathname = path.slice(0, qIndex);
      search = path.slice(qIndex + 1);
    }
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    const req = new EventEmitter();
    req.method = String(method || 'GET').toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.baseUrl = '';
    req.path = pathname;
    req.headers = {
      host: '127.0.0.1',
      'content-type': 'application/json',
      ...Object.fromEntries(
        Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]),
      ),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.connection = req.socket;
    req.query = Object.fromEntries(params);
    req.body = body;
    req.session = session || {};
    if (typeof req.session.save !== 'function') {
      req.session.save = (cb) => {
        if (typeof cb === 'function') cb();
      };
    }
    req.get = (name) => req.headers[String(name).toLowerCase()];

    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const res = new EventEmitter();
    res.req = req;
    req.res = res;
    res.statusCode = 200;
    res.headersSent = false;
    res.headers = {};
    res.setHeader = (k, v) => {
      res.headers[String(k).toLowerCase()] = v;
    };
    res.set = (k, v) => {
      if (k && typeof k === 'object' && v === undefined) {
        for (const [key, val] of Object.entries(k)) res.setHeader(key, val);
        return res;
      }
      res.setHeader(k, v);
      return res;
    };
    res.getHeader = (k) => res.headers[String(k).toLowerCase()];
    res.removeHeader = (k) => {
      delete res.headers[String(k).toLowerCase()];
    };
    res.writeHead = (code, hdrs) => {
      if (typeof code === 'number') res.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) res.setHeader(k, v);
      }
    };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.headersSent = true;
      res.setHeader('content-type', 'application/json');
      done({ status: res.statusCode, body: payload, headers: res.headers, text: JSON.stringify(payload) });
      return res;
    };
    res.send = (payload) => {
      res.headersSent = true;
      done({ status: res.statusCode, body: payload, headers: res.headers, text: payload == null ? '' : String(payload) });
      return res;
    };
    res.redirect = (arg1, arg2) => {
      let code = 302;
      let location = arg1;
      if (typeof arg1 === 'number') {
        code = arg1;
        location = arg2;
      }
      res.headersSent = true;
      res.statusCode = code;
      res.setHeader('location', location);
      done({ status: code, body: undefined, location, headers: res.headers, text: '' });
      return res;
    };
    res.end = (chunk) => {
      res.headersSent = true;
      done({
        status: res.statusCode,
        body: chunk,
        headers: res.headers,
        text: chunk == null ? '' : String(chunk),
      });
      return res;
    };
    res.write = () => true;

    const handle = typeof app.handle === 'function' ? app.handle.bind(app) : app;
    try {
      handle(req, res, (err) => {
        if (err) reject(err);
        else if (!settled) done({ status: res.statusCode, body: undefined, headers: res.headers, text: '' });
      });
    } catch (err) {
      reject(err);
    }
  });
}
