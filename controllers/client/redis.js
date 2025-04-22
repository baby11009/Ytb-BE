const { StatusCodes } = require("http-status-codes");
const { removeKey } = require("../../redis/instance/client");
const { InternalServerError, BadRequestError } = require("../../errors/");
const removeRedisKey = async (req, res) => {
  const redisKey = req.headers["session-id"];
  if (!redisKey) {
    throw new BadRequestError("Session ID is required");
  }

  try {
    await removeKey(redisKey);

    res
      .status(StatusCodes.OK)
      .json({ message: "Remove redis key successfully" });
  } catch (error) {
    console.error(error);
    throw new InternalServerError("Failed to remove redis key");
  }
};

const cleanRedisRandomKey = async (req, res) => {
  const sessionId = req.cookies.sessionId;
  console.log("🚀 ~ sessionId:", sessionId);

  if (!sessionId) {
    throw new BadRequestError("Session ID is required");
  }
  try {
    await removeKey(`session:${sessionId}-video`);
    await removeKey(`session:${sessionId}-playlist`);
    await removeKey(`session:${sessionId}-short`);
    await removeKey(`session:${sessionId}-type`);

    res
      .status(StatusCodes.OK)
      .json({ message: "Remove redis key successfully" });
  } catch (error) {
    console.error(error);
    throw new InternalServerError("Failed to remove redis key");
  }
};

module.exports = {
  removeRedisKey,
  cleanRedisRandomKey,
};
