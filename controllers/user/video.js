const { User, Video, Subscribe } = require("../../models");

const { StatusCodes } = require("http-status-codes");

const {
  BadRequestError,
  NotFoundError,
  InvalidError,
  InternalServerError,
} = require("../../errors");

const { deleteFile, getVideoDuration } = require("../../utils/file");
const { createHls } = require("../../utils/createhls");
const { clearUploadedVideoFiles } = require("../../utils/clear");

const { Validator } = require("../../utils/validate");

const {
  sendRealTimeNotification,
} = require("../../service/notification/notification");
const {
  uploadVideo,
  updateVideoDetails,
  deleteSingleVideo,
  deleteVideos,
} = require("../../service/video-service");

const upLoadVideo = async (req, res) => {
  const { thumbnail, video } = req.files;

  const { userId, name } = req.user;

  const { type, title, tags = [], description = "" } = req.body;

  try {
    const fileErr = [];

    if (!video || video.length === 0) {
      fileErr.push("video");
    }

    if (!thumbnail || thumbnail.length === 0) {
      fileErr.push("thumbnail");
    }

    if (fileErr.length > 0) {
      throw new BadRequestError(`Please provide ${fileErr.join(", ")}`);
    }

    const videoPath = video[0].path; // Đường dẫn đến video vừa upload
    const filename = video[0].filename.split(".")[0];

    await createHls(filename, videoPath, type);

    const videoDuration = await getVideoDuration(videoPath);

    const data = {
      user_id: userId,
      type: type,
      title: title,
      video: video[0].filename,
      stream: filename,
      thumb: thumbnail[0].filename,
      duration: videoDuration,
      tags: tags,
      description,
    };

    const createdVideo = await uploadVideo(data);

    const notifi = async () => {
      const subscriberList = await Subscribe.find({
        channel_id: userId,
        notify: 1,
      });

      if (subscriberList.length > 0) {
        for (const subscriber of subscriberList) {
          sendRealTimeNotification({
            senderId: userId,
            receiverId: subscriber.subscriber_id,
            type: "subscription",
            videoId: createdVideo._id,
            message: `${name} has uploaded new video: ${createdVideo.title}`,
          });
        }
      }
    };

    notifi();

    res.status(StatusCodes.CREATED).json({ msg: "Upload video successfully" });
  } catch (error) {
    let args = {};

    if (video & video[0]) {
      args.videoPath = video[0].path;
    }

    if (thumbnail & thumbnail[0]) {
      args.imagePath = thumbnail[0].path;
    }
    await clearUploadedVideoFiles(args);
    throw error;
  }
};

const getVideos = async (req, res) => {
  const { userId } = req.user;

  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const { sort, search } = req.query;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = { user_id: userId };

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncsObj = {
      title: (title) => {
        validator.isString("title", title);
        searchObj["title"] = { $regex: title, $options: "i" };
      },
      type: (type) => {
        validator.isEnum("type", ["video", "short"], type);
        searchObj["type"] = type;
      },
    };

    for (const [key, value] of searchEntries) {
      if (!searchFuncsObj[key]) {
        errors.invalidKey.push(key);
        continue;
      }

      try {
        searchFuncsObj[key](value);
      } catch (error) {
        errors.invalidValue.push(key);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set([
      "createdAt",
      "view",
      "like",
      "dislike",
      "totalCmt",
    ]);

    const sortValueEnum = { 1: 1, "-1": -1 };
    for (const [key, value] of sortEntries) {
      if (!sortKeys.has(key)) {
        errors.invalidKey.push(key);
        continue;
      }

      if (!sortValueEnum[value]) {
        errors.invalidValue.push(key);
        continue;
      }

      sortObj[key] = sortValueEnum[value];
    }
  }

  for (const error in errors) {
    if (errors[error].length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  if (Object.keys(sortObj).length < 1) {
    sortObj = {
      createdAt: -1,
    };
  }

  const pipeline = [
    {
      $match: searchObj,
    },
    {
      $lookup: {
        from: "users", // Collection users mà bạn muốn join
        localField: "user_id", // Trường trong collection videos (khóa ngoại)
        foreignField: "_id", // Trường trong collection users (khóa chính)
        as: "user_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        user_info: 1,
        tags: 1,
        thumb: 1,
        type: 1,
        view: 1,
        like: 1,
        dislike: 1,
        description: 1,
        createdAt: -1,
      },
    },
    {
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  let result = Video.aggregate(pipeline);

  const videos = await result;

  res.status(StatusCodes.OK).json({
    data: videos[0]?.data,
    qtt: videos[0]?.data?.length,
    totalQtt: videos[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(videos[0]?.totalCount[0]?.total / limit),
  });
};

const getVideoDetails = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  const video = await Video.aggregate([
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: {
        $and: [{ _idStr: id }, { user_id: userId }],
      },
    },
    {
      $lookup: {
        from: "tags",
        let: { tagIds: "$tags" },
        pipeline: [
          {
            $addFields: {
              _idStr: { $toString: "$_id" },
            },
          },
          {
            $match: {
              $expr: { $in: ["$_idStr", "$$tagIds"] },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              slug: 1,
            },
          },
        ],
        as: "tags_info",
      },
    },
    {
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        tags_info: { $ifNull: ["$tag_info", []] },
        tags: 1,
        thumb: 1,
        video: 1,
        stream: {
          $cond: {
            if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
            then: "$stream", // Keep the `stream` value if it exists
            else: null, // Set it to null if it doesn't exist
          },
        },
        type: 1,
        view: 1,
        like: 1,
        dislike: 1,
        description: 1,
      },
    },
  ]);

  if (video.length < 1) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }
  res.status(StatusCodes.OK).json({ data: video[0] });
};

const updateVideo = async (req, res) => {
  const { id } = req.params;

  const { userId } = req.user;

  try {
    if (
      Object.keys(req.body).length === 0 &&
      !req.files.thumbnail &&
      !req.files.thumbnail[0]
    ) {
      throw new BadRequestError("There is nothing to update.");
    }

    const foundedVideo = await Video.findOne({ _id: id, user_id: userId });

    if (!foundedVideo) {
      throw new NotFoundError(`Not found video with id ${id}`);
    }

    await updateVideoDetails({ _id: id }, req.body, req.files, [
      "title",
      "thumbnail",
      "type",
      "tags",
      "description",
    ]);

    res.status(StatusCodes.OK).json({ msg: "Video updated successfully" });
  } catch (error) {
    if (req.files?.thumbnail && req.files?.thumbnail.length) {
      deleteFile(req.files.thumbnail[0].path);
    }

    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }
    throw error;
  }
};

const deleteVideo = async (req, res) => {
  const { userId } = req.user;

  const { id } = req.params;

  try {
    await deleteSingleVideo({ user_id: userId, _id: id });

    res.status(StatusCodes.OK).json({ msg: "Video deleted successfully" });
  } catch (error) {
    console.error("User delete one video error: ", error);
    throw new InternalServerError("Failed to delete video");
  }
};

const deleteManyVideos = async (req, res) => {
  const { idList } = req.query;

  const { userId } = req.user;

  if (!idList) {
    throw new BadRequestError("Please provide a list of video id to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  try {
    await deleteVideos(idArray, {
      user_id: userId,
    });
    return res
      .status(StatusCodes.OK)
      .json({ msg: "Videos deleted successfully" });
  } catch (error) {
    console.error("User delete many video error: ", error);
    throw new InternalServerError("Failed to delete many video");
  }
};

module.exports = {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
};
