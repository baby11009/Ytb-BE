const { Notification } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");

const createNotification = async (req, res) => {
  const { senderId, receiverId, type, videoId, cmtId, message } = req.body;
  await Notification.create({
    sender_user_id: senderId,
    receiver_user_id: receiverId,
    type,
    video_id: videoId,
    comment_id: cmtId,
    message,
  });

  res.status(StatusCodes.OK).json("OK");
};

module.exports = { createNotification };
