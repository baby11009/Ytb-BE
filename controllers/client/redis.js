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

const cleanRedisKey = async (req, res) => {
  const { apiPath } = req.query;

  const sessionId = req.cookies.sessionId;

  if (!sessionId) {
    throw new BadRequestError("Session ID is required");
  }
  try {
    let keyList;

    switch (apiPath) {
      case "randomShort":
        keyList = [`session:${sessionId}-short`];
        break;
      default:
        keyList = [
          `session:${sessionId}-video`,
          `session:${sessionId}-playlist`,
          `session:${sessionId}-short`,
          `session:${sessionId}-type`,
        ];
    }

    await removeKey(keyList);

    // res.clearCookie("sessionId", {
    //   httpOnly: true,
    //   secure: true, // 👈 bắt buộc nếu dùng SameSite: 'None'
    //   sameSite: "None",
    // });

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
  cleanRedisKey,
};
