const { User, Video } = require("../../models");
const mongoose = require("mongoose");

const path = require("path");

const { StatusCodes } = require("http-status-codes");

const {
  BadRequestError,
  NotFoundError,
  InvalidError,
} = require("../../errors");

const { deleteFile, getVideoDuration } = require("../../utils/file");
const { createHls } = require("../../utils/createhls");
const { clearUploadedVideoFiles } = require("../../utils/clear");

const { searchWithRegex, isObjectEmpty } = require("../../utils/other");
const { VideoValidator, Validator } = require("../../utils/validate");

const { sessionWrap } = require("../../utils/session");

const videoFolderPath = path.join(__dirname, "../../assets/video thumb");

const upLoadVideo = async (req, res) => {
  const { thumbnail, video } = req.files;

  const {
    userId,
    type,
    title,
    tags = [],
    view = 0,
    like = 0,
    dislike = 0,
  } = req.body;

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

    if (!userId) {
      throw new BadRequestError("Please provide user id");
    }

    const foundedUser = await User.findById(userId);

    if (!foundedUser) {
      throw new NotFoundError(`Not found user with id ${userId}`);
    }

    const videoPath = video[0].path;
    const filename = video[0].filename.split(".")[0];

    await createHls(filename, videoPath, type);

    const videoDuration = await getVideoDuration(video[0].path);

    const data = {
      user_id: userId,
      type: type,
      title: title,
      video: video[0].filename,
      stream: filename,
      thumb: thumbnail[0].filename,
      duration: videoDuration,
      tags: tags,
      view,
      like,
      dislike,
    };

    await sessionWrap(async (session) => {
      await Video.create([data], { session });
    });

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
  const { sort, search } = req.query;

  let limit = Number(req.query.limit) || 10;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncsObj = {
      email: (email) => {
        validator.isString("email", email);
        searchObj["user_info.email"] = searchWithRegex(email);
      },
      name: (name) => {
        validator.isString("name", name);

        searchObj["user_info.name"] = searchWithRegex(name);
      },
      type: (type) => {
        validator.isEnum("type", ["short", "video"], type);

        searchObj["type"] = type;
      },
      title: (title) => {
        validator.isString("title", title);
        searchObj["title"] = searchWithRegex(title);
      },
      exclude: (excludeIdList) => {
        // In FE i have converted excludeIdList to json to make sure express will not automatically
        // converted my array in to object if it contains to much elements
        const idList = JSON.parse(excludeIdList);
        validator.isArray("exclude", idList);
        searchObj["_idStr"] = { $nin: idList };
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

    const sortValueEnum = {
      1: 1,
      "-1": -1,
    };

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

  if (isObjectEmpty(sortObj)) {
    sortObj.createdAt = -1;
  }

  const pipeline = [
    {
      $lookup: {
        from: "users", // Collection users mà bạn muốn join
        localField: "user_id", // Trường trong collection videos (khóa ngoại)
        foreignField: "_id", // Trường trong collection users (khóa chính)
        pipeline: [
          {
            $project: {
              email: 1,
              name: 1,
              avatar: 1,
            },
          },
        ],
        as: "user_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $set: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: searchObj,
    },
    {
      $project: {
        _id: 1,
        title: 1,
        user_info: 1,
        thumb: 1,
        duration: { $ifNull: ["$duration", 0] },
        type: 1,
        view: 1,
        like: 1,
        totalCmt: 1,
        dislike: 1,
        createdAt: 1,
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

  const videos = await Video.aggregate(pipeline);

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

  const video = await Video.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(id) }, // Lọc video theo id
    },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        pipeline: [{ $project: { email: 1 } }],
        as: "user_info",
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $lookup: {
        from: "tags",
        let: { tagIds: "$tags" },
        pipeline: [
          {
            $set: {
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
        user_info: 1,
        tags_info: { $ifNull: ["$tags_info", []] },
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

  if (!video) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: video[0] });
};

const updateVideo = async (req, res) => {
  const { id } = req.params;

  try {
    if (id === "" || id === ":id") {
      throw new BadRequestError("Please provide video id");
    }

    if (Object.keys(req.body).length === 0 && !req.files.thumbnail) {
      throw new BadRequestError("There is nothing to update.");
    }

    const foundedVideo = await Video.findById(id);

    if (!foundedVideo) {
      throw new NotFoundError(`Not found video with id ${id}`);
    }

    const updateDatas = await new VideoValidator(
      {
        ...req.body,
        ...req.files,
      },
      foundedVideo,
    ).getValidatedUpdateData();

    const video = await sessionWrap(async (session) => {
      const video = await Video.updateOne(
        { _id: id, user_id: foundedVideo.user_id, view: foundedVideo.view },
        updateDatas,
        { session },
      );

      return video;
    });

    if (req.files?.thumbnail && req.files?.thumbnail.length) {
      const imgPath = path.join(videoFolderPath, video.thumb);
      deleteFile(imgPath);
    }

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
  const { id } = req.params;

  if (id === "" || id === ":id") {
    throw new BadRequestError(`Video id cannot be empty`);
  }

  const foundedVideo = await Video.findById(id);

  if (!foundedVideo) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  try {
    await sessionWrap(async (session) => {
      await Video.deleteOne({ _id: id }, { session });
    });

    res.status(StatusCodes.OK).json({ msg: "Video deleted successfully" });
  } catch (error) {
    throw error;
  }
};

const deleteManyVideos = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of video id to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  const foundedVideos = await Video.find({ _id: { $in: idArray } }).select(
    "_id",
  );

  if (foundedVideos.length < 1) {
    throw new NotFoundError(`Not found any video with these ids: ${idList}`);
  }

  if (foundedVideos.length !== idArray.length) {
    const notFoundedList = [];

    foundedVideos.forEach((video) => {
      if (idArray.includes(video._id.toString())) {
        notFoundedList.push(video._id);
      }
    });

    throw new NotFoundError(
      `Not found any video with these ids: ${notFoundedList.join(", ")}`,
    );
  }

  await sessionWrap(async (session) => {
    await Video.deleteMany({ _id: { $in: idArray } }, { session });
  });

  res.status(StatusCodes.OK).json({ msg: "Videos deleted successfully" });
};

module.exports = {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
};
