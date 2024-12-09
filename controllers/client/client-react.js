const { BadRequestError, NotFoundError } = require("../../errors");
const { React, Video, Playlist } = require("../../models");
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

  let result = {};
  let likeCount = 0;
  let dislikeCount = 0;

  const addItem = async () => {
    await Playlist.updateOne(
      {
        created_user_id: userId,
        title: "Liked videos",
        type: "personal",
      },
      { $push: { itemList: videoId } },
    );
  };

  const removeItem = async () => {
    await Playlist.updateOne(
      {
        created_user_id: userId,
        title: "Liked videos",
        type: "personal",
      },
      { $pull: { itemList: videoId } },
    );
  };

  if (exitsingReact) {
    if (type === exitsingReact.type) {
      const data = await React.findOneAndDelete({ _id: exitsingReact._id });

      result = {
        msg: `Successfully un${type}d video`,
        type: "DELETE",
        data: data,
      };

      if (type === "like") {
        likeCount = -1;
        await removeItem();
      } else {
        dislikeCount = -1;
      }
    } else {
      const data = await React.findOneAndUpdate(finalData, { type: type });
      result = {
        msg: `Successfully change video react to ${type}`,
        type: "UPDATE",
        data: data,
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
      data: data,
    };

    if (type === "like") {
      likeCount = 1;
      await addItem();
    } else {
      dislikeCount = 1;
    }
  }

  const video = await Video.findByIdAndUpdate(videoId, {
    $inc: { like: likeCount, dislike: dislikeCount },
  });

  res.status(StatusCodes.OK).json(result);
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
