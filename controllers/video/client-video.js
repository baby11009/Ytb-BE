const Video = require("../../models/video");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");

const { BadRequestError, NotFoundError } = require("../../errors");

const getVideo = async (req, res) => {
  const { id } = req.params;

  const { subscriberId } = req.query;

  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "channel_info",
      },
    },
    {
      $unwind: "$channel_info",
    },
  ];

  if (subscriberId) {

    // Subscription state
    pipeline.push({
      $lookup: {
        from: "subscribes",
        let: {
          videoOwnerId: "$user_id",
          subscriberId: new mongoose.Types.ObjectId(subscriberId),
        },
        // pipeline để so sánh dữ liệu
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$channel_id", "$$videoOwnerId"] },
                  { $eq: ["$subscriber_id", "$$subscriberId"] },
                ],
              },
            },
          },
        ],
        as: "subscription_info",
      },
    });
    pipeline.push({
      $unwind: {
        path: "$subscription_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
    });

    
    pipeline.push({
      $lookup: {
        from: "reacts",
        let: {
          videoId: new mongoose.Types.ObjectId(id),
          subscriberId: new mongoose.Types.ObjectId(subscriberId),
        },
        // pipeline để so sánh dữ liệu
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$video_id", "$$videoId"] },
                  { $eq: ["$user_id", "$$subscriberId"] },
                ],
              },
            },
          },
        ],
        as: "react_info",
      },
    });
    pipeline.push({
      $unwind: {
        path: "$react_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1, // Các trường bạn muốn giữ lại từ Video
      "channel_info._id": 1,
      "channel_info.name": 1,
      "channel_info.avatar": 1,
      "channel_info.subscriber": 1,
      thumb: 1,
      video: 1,
      type: 1,
      view: 1,
      like: 1,
      disLike: 1,
      totalCmt: 1,
      createdAt: 1,
      "subscription_info.notify": {
        $ifNull: ["$subscription_info.notify", null],
      },
      "subscription_info._id": { $ifNull: ["$subscription_info._id", null] },
      "react_info._id": { $ifNull: ["$react_info._id", null] },
      "react_info.type": {
        $ifNull: ["$react_info.type", null],
      },
    },
  });

  const video = await Video.aggregate(pipeline);

  if (!video) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: video[0] });
};

module.exports = { getVideo };
