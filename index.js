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
    let cacheOptions = pick(options, 'expiration', 'cacheKey');

    this.client = redis.createClient(options);

    this.expiration = cacheOptions.expiration || FIVE_MINUTES;
    this.connected = false;
    this.cacheKey = typeof cacheOptions.cacheKey === 'function' ?
      options.cacheKey : (path) => path;

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

    let request = response && response.req;
    let key = this.cacheKey(path, request);

    return new Promise((res, rej) => {
      if (response && response.statusCode >= 300) {
        res();
        return;
      }

      this.client.multi()
        .set(key, body)
        .expire(key, this.expiration)
        .exec(err => {
          if (err) {
            rej(err);
          } else {
            res();
          }
        });
    });
  }
}

module.exports = RedisCache;
