const redis = require("redis");

const publisher = redis.createClient();
const subscriber = redis.createClient();
const client = redis.createClient();

const connectRedis = async () => {
  try {
    // Wait for both clients to connect
    await publisher.connect();
    await subscriber.connect();

    // Log when both are connected
    console.log("Publisher connected to Redis.");
    console.log("Subscriber connected to Redis.");
  } catch (error) {
    // Handle connection errors
    console.error("Failed to connect to Redis:", error);
    process.exit(1); // Exit the process if Redis connection fails
  }
};

// Call the connectRedis function to establish connection
connectRedis();

// Optionally add error handling
publisher.on("error", (err) => {
  console.error("Error with Redis publisher:", err);
});

subscriber.on("error", (err) => {
  console.error("Error with Redis subscriber:", err);
});

module.exports = {
  publisher,
  subscriber,
};
