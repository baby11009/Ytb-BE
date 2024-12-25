const { StatusCodes } = require("http-status-codes");
const { InternalServerError } = require("../../errors/");
const redis = require("redis");
const client = redis.createClient();

const removeRedisKey = async (req, res) => {
  try {
    const redisKey = req.headers["session-id"];

    await client.connect();

    await client.del(redisKey);

    await client.disconnect();

    res
      .status(StatusCodes.OK)
      .json({ message: "Remove redis key successfully" });
    console.log(`Remove redis key : ${redisKey}`);
  } catch (error) {
    console.error(error);
    throw new InternalServerError("Failed to remove redis key");
  }
};

module.exports = {
  removeRedisKey,
};
