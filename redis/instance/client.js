const redis = require("redis");

const client = redis.createClient();

const connectRedis = async () => {
  try {
    await client.connect();
    console.log(`Redis connect to instance client`);

    client.on("error", (err) => {
      console.error(`Redis client Error:`, err);
    });
  } catch (error) {
    console.error(`Failed to connect to Redis instance client:`, error);
    process.exit(1);
  }
};


const getValue = async (key) => {
  return await client.get(key);
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
  setKeyExpire,
  removeKey,
  connectRedis,
};
