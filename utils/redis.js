/* eslint-disable linebreak-style */
import redis from 'redis';

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (err) => console.error(`Redis client not connected: ${err}`));
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });
  }

  async set(key, value, duration) {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, 'EX', duration, (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });
  }

  async del(key) {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });
  }
}

const redisClient = new RedisClient();
export default redisClient;
