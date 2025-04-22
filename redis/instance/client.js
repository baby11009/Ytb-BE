const redis = require("redis");

const client = redis.createClient({
  url: "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      // Reconnect after specific ms, with exponential backoff
      return Math.min(retries * 50, 1000);
    },
  },
});

const getValue = async (key) => {
  return await client.get(key);
};

const getSetValue = async (key) => {
  return await client.sMembers(key);
};

const removeSetValue = async (key, value) => {
  try {
    await client.sRem(key, value);
  } catch (err) {
    console.error("Error removing value from Redis set:", err);
  }
};

const addValue = async (key, value, expire = 3600) => {
  try {
    if (Array.isArray(value)) {
      await client.sAdd(key, value);
      await client.expire(key, expire);
    } else {
      await client.set(key, value, { EX: expire });
    }
  } catch (err) {
    console.error("Error adding value to Redis:", err);
  }
};

const setKeyExpire = async (key, time = 300) => {
  await client.expire(key, time);
};

const removeKey = async (redisKey) => {
  const exists = await client.exists(redisKey);
  if (exists) {
    await client.del(redisKey);
    console.log(`Removed key: ${redisKey}`);
  } else {
    console.log(`Key ${redisKey} not found in Redis`);
  }
};

module.exports = {
  client,
  addValue,
  getValue,
  getSetValue,
  removeSetValue,
  setKeyExpire,
  removeKey,
};
