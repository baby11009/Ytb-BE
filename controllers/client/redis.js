const { StatusCodes } = require("http-status-codes");
const { InternalServerError } = require("../../errors/");
const {
  connectRedis,
  disconnectRedis,
  removeKey,
} = require("../../utils/redis");
const removeRedisKey = async (req, res) => {
  const redisKey = req.headers["session-id"];
  if (!redisKey) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "Session ID is required" });
  }

  try {
    await connectRedis();
    await removeKey(redisKey);
    await disconnectRedis();

    res
      .status(StatusCodes.OK)
      .json({ message: "Remove redis key successfully" });
  } catch (error) {
    console.error(error);
    await disconnectRedis();
    throw new InternalServerError("Failed to remove redis key");
  }
};

module.exports = {
  removeRedisKey,
};
