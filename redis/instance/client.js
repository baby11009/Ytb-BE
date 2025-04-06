const redis = require("redis");

const client = redis.createClient();

const addValue = async (key, value) => {
  try {
    if (Array.isArray(value)) {
      await client.sAdd(key, value);
    } else {
      const reply = await client.set(key, value);
      console.log(reply);
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

module.exports = { client, addValue, setKeyExpire, removeKey };
