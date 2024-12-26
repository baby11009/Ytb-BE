const { StatusCodes } = require("http-status-codes");
const { InternalServerError } = require("../../errors/");
const {
  client,
  connectRedis,
  disconnectRedis,
  removeKey,
} = require("../../utils/redis");

const removeRedisKey = async (req, res) => {
  try {
    const redisKey = req.headers["session-id"];

    await connectRedis();

    await removeKey(redisKey);

    await disconnectRedis();

    console.log(`Remove redis key : ${redisKey}`);

    res
      .status(StatusCodes.OK)
      .json({ message: "Remove redis key successfully" });
  } catch (error) {
    console.error(error);
    // await disconnectRedis();
    throw new InternalServerError("Failed to remove redis key");
  }
};

module.exports = {
  removeRedisKey,
};
