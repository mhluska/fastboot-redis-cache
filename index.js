'use strict';

const redis = require('redis');

const FIVE_MINUTES = 5 * 60;

function pick(object, ...keys) {
  let pickedObject = {};
  keys.forEach(key => {
    pickedObject[key] = object[key];
    delete object[key];
  });
  return pickedObject;
}

class RedisCache {
  constructor(options) {
    let cacheOptions = pick(options, 'expiration', 'cacheKey', 'skipCache');

    this.client = redis.createClient(options);
    this.connected = false;

    if (typeof cacheOptions.expiration === 'function') {
      this.expiration = cacheOptions.expiration;
    } else {
      this.expiration = () => (cacheOptions.expiration || FIVE_MINUTES);
    }

    if (typeof cacheOptions.cacheKey === 'function') {
      this.cacheKey = cacheOptions.cacheKey;
    } else {
      this.cacheKey = (path) => path;
    }

    this.skipCache = cacheOptions.skipCache || (() => false);

    this.client.on('error', error => {
      this.ui.writeLine(`redis error; err=${error}`);
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.ui.writeLine('redis connected');
    });

    this.client.on('end', () => {
      this.connected = false;
      this.ui.writeLine('redis disconnected');
    });
  }

  fetch(path, request) {
    if (!this.connected) { return; }

    path = this.addTrailingSlash(path);

    if (this.skipCache(path, request)) {
      return Promise.reject(new Error('Cache skipped'));
    }

    let key = this.cacheKey(path, request);

    return new Promise((res, rej) => {
      this.client.get(key, (err, reply) => {
        if (err) {
          rej(err);
        } else {
          res(reply);
        }
      });
    });
  }

  put(path, body, response) {
    if (!this.connected) { return; }

    path = this.addTrailingSlash(path);

    let request = response && response.req;
    let key = this.cacheKey(path, request);
    let expiration = this.expiration(path, request);

    return new Promise((res, rej) => {
      if (response && response.statusCode >= 300) {
        res();
        return;
      }

      this.client.multi()
        .set(key, body)
        .expire(key, expiration)
        .exec(err => {
          if (err) {
            rej(err);
          } else {
            res();
          }
        });
    });
  }

  addTrailingSlash(path) {
    let lastChar = path.substr(-1);
    if (lastChar !== '/') path = path + '/';
    return path;
  }
}

module.exports = RedisCache;
