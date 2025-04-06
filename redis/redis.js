const redisInstances = require("./instance");

const connectRedis = async () => {
  for (const [name, instance] of Object.entries(redisInstances)) {
    try {
      await instance.connect();
      console.log(`Redis connect to instance ${name}`);

      instance.on("error", (err) => {
        console.error(`Redis ${name} Error:`, err);
      });
    } catch (error) {
      console.error(`Failed to connect to Redis instance ${name}:`, error);
      process.exit(1);
    }
  }
};

module.exports = { connectRedis };
