const mongoose = require("mongoose");
const { Video, VideoView } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { sessionWrap } = require("../../utils/session");
const { NotFoundError, BadRequestError } = require("../../errors");

const increaseVideoView = async (req, res) => {
  const { videoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new BadRequestError("video id is not valid");
  }

  const foundedVideo = await Video.findById(videoId);

  if (!foundedVideo) {
    throw new NotFoundError(`Not found video with id ${videoId}`);
  }

  const userId = req?.user?.userId;

  const query = { _id: videoId, user_id: foundedVideo.user_id };

  const videoViewData = {
    video_id: foundedVideo._id,
    video_owner_id: foundedVideo.user_id,
  };

  if (userId) {
    query["user_id"] = userId;
    videoViewData["viewer_id"] = userId;
  }

  await sessionWrap(async (session) => {
    await Video.updateOne(query, { $inc: { view: 1 } }, { session });

    await VideoView.create([videoViewData], { session });
  });

  res.status(StatusCodes.OK).json({ message: "View increase" });
};

module.exports = {
  increaseVideoView,
};
