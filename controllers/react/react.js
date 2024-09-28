const { BadRequestError, NotFoundError } = require("../../errors");
const video = require("../../models/video");
const { React, Video } = require("../../models");
const { StatusCodes } = require("http-status-codes");

const toggleReact = async (req, res) => {
  const { userId } = req.user;

  const { videoId, type } = req.body;

  if (!videoId) {
    throw new BadRequestError("Please provide a video id");
  }

  if (!type) {
    throw new BadRequestError("Please provide a video id");
  }

  const finalData = {
    user_id: userId,
    video_id: videoId,
  };

  const exitsingReact = await React.findOne(finalData);

  let msg;
  let likeCount = 0;
  let dislikeCount = 0;

  if (exitsingReact) {

    if (type === exitsingReact.type) {
      await React.deleteOne({ _id: exitsingReact._id });
      msg = `Successfully un${type}d video`;
      if (type === "like") {
        likeCount = -1;
      } else {
        dislikeCount = -1;
      }
    } else {
      await React.findOneAndUpdate(finalData, { type: type });
      msg = `Successfully change video react to ${type}`;
      if (type === "like") {
        likeCount = 1;
        dislikeCount = -1;
      } else {
        likeCount = -1;
        dislikeCount = 1;
      }
    }
  } else {
    await React.create({ ...finalData, type });
    msg = `Successfully ${type}d video`;
    if (type === "like") {
      likeCount = 1;
    } else {
      dislikeCount = 1;
    }
  }

  const video = await Video.findByIdAndUpdate(videoId, {
    $inc: { like: likeCount, disLike: dislikeCount },
  });

  res.status(StatusCodes.OK).json({ msg });
};

const getVideotReactState = async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new BadRequestError("Please provide a video id");
  }

  const reactStatus = await React.findOne({ video_id: videoId }).select("type");

  let result = reactStatus;

  if (!reactStatus) {
    result = {
      type: "undefined",
    };
  }

  res.status(StatusCodes.OK).json({ data: result });
};

module.exports = { toggleReact, getVideotReactState };
