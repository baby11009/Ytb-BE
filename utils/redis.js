const redis = require("redis");

// Khởi tạo Redis client
const client = redis.createClient({ debug: true });

// Sự kiện lỗi
client.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

// Kết nối client
const connectRedis = async () => {
  if (!client.isOpen) {
    try {
      await client.connect();
      console.log("Redis client connected");
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      process.exit(1); // Thoát nếu kết nối không thành công
    }
  }
};

// Đóng kết nối Redis khi ứng dụng tắt
const disconnectRedis = async () => {
  if (client.isOpen) {
    await client.disconnect();
    console.log("Redis client disconnected");
  }
};

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

const setKeyExpire = async (key, time) => {
  await client.expire(key, 300);
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
  connectRedis,
  disconnectRedis,
  addValue,
  setKeyExpire,
  removeKey,
};
