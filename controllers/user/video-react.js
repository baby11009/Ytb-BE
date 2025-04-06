const { BadRequestError, NotFoundError } = require("../../errors");
const { React, Video, Playlist } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const {
  sendRealTimeNotification,
} = require("../../service/notification/notification");

const toggleReact = async (req, res) => {
  const { userId } = req.user;

  const { videoId, type } = req.body;

  if (!videoId) {
    throw new BadRequestError("Please provide a video id");
  }

  if (!type) {
    throw new BadRequestError("Please provide a video id");
  }

  const foundedVideo = await Video.findById(videoId).select("_id user_id");

  if (!foundedVideo) {
    throw new NotFoundError("Not found video with id " + videoId);
  }

  const finalData = {
    user_id: userId,
    video_id: videoId,
  };

  const exitsingReact = await React.findOne(finalData);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let result = {};
    let likeCount = 0;
    let dislikeCount = 0;

    const addItem = async () => {
      await Playlist.updateOne(
        {
          created_user_id: userId,
          type: "liked",
        },
        { $push: { itemList: videoId } },
        { session },
      );
    };

    const removeItem = async () => {
      console.log("remove from liked list");
      await Playlist.updateOne(
        {
          created_user_id: userId,
          type: "liked",
        },
        { $pull: { itemList: videoId } },
        { session },
      );
    };

    if (exitsingReact) {
      if (type === exitsingReact.type) {
        const data = await React.findOneAndDelete(
          { _id: exitsingReact._id },
          { returnDocument: "after", session },
        );

        result = {
          msg: `Successfully un${type}d video`,
          type: "DELETE",
          data: { _id: data._id, type: data.type },
        };

        if (type === "like") {
          likeCount = -1;
          await removeItem();
        } else {
          dislikeCount = -1;
        }
      } else {
        const data = await React.findOneAndUpdate(
          finalData,
          { type: type },
          { returnDocument: "after", session },
        );
        result = {
          msg: `Successfully change video react to ${type}`,
          type: "UPDATE",
          data: {
            _id: data._id,
            type: data.type,
          },
        };
        if (type === "like") {
          likeCount = 1;
          dislikeCount = -1;
          await addItem();
        } else {
          likeCount = -1;
          dislikeCount = 1;
          await removeItem();
        }
      }
    } else {
      const data = await React.create({ ...finalData, type });

      result = {
        msg: `Successfully ${type}d video`,
        type: "CREATE",
        data: { _id: data._id, type: data.type },
      };

      if (type === "like") {
        likeCount = 1;
        await addItem();
      } else {
        dislikeCount = 1;
      }
    }

    await Video.updateOne(
      { _id: videoId },
      {
        $inc: { like: likeCount, dislike: dislikeCount },
      },
      { session },
    );
    await session.commitTransaction();

    if (userId.toString() !== foundedVideo.user_id.toString()) {
      sendRealTimeNotification(foundedVideo.user_id, "content", result.msg);
    }

    res.status(StatusCodes.OK).json(result);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession;
  }
};

const getVideotReactState = async (req, res) => {
  const { userId } = req.user;
  const { videoId } = req.params;

  if (!videoId) {
    throw new BadRequestError("Please provide a video id");
  }

  const reactStatus = await React.findOne({
    video_id: videoId,
    user_id: userId,
  }).select("type");

  let result = reactStatus;

  if (!reactStatus) {
    result = {
      type: "undefined",
    };
  }

  res.status(StatusCodes.OK).json({ data: result });
};

module.exports = { toggleReact, getVideotReactState };
