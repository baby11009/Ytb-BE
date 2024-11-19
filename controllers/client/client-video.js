const { User, Video, Comment, CmtReact } = require("../../models");
const mongoose = require("mongoose");

const { StatusCodes } = require("http-status-codes");

const {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} = require("../../errors");

const { deleteFile, getVideoDuration } = require("../../utils/file");

const path = require("path");

const asssetPath = path.join(__dirname, "../../assets");

const upLoadVideo = async (req, res) => {
  const { image, video } = req.files;

  const { userId } = req.user;

  const { type, title, tag = [], description = "" } = req.body;

  const videoPath = path.join(asssetPath, "videos", video[0].filename);

  try {
    const fileErr = [];

    if (!video || video.length === 0) {
      fileErr.push("video");
    }

    if (!image || image.length === 0) {
      fileErr.push("image");
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

    const videoDuration = await getVideoDuration(videoPath);

    const data = {
      user_id: userId,
      type: type,
      title: title,
      video: video[0].filename,
      thumb: image[0].filename,
      duration: videoDuration,
      tag: tag,
      description,
    };

    await Video.create(data);

    res.status(StatusCodes.CREATED).json({ msg: "Upload video successfully" });
  } catch (error) {
    if (image && image[0]) {
      const imagePath = path.join(asssetPath, "video thumb", image[0].filename);
      deleteFile(imagePath);
    }

    if (video && video[0]) {
      deleteFile(videoPath);
    }
    throw error;
  }
};

const getVideos = async (req, res) => {
  const { userId } = req.user;

  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const { sort } = req.query;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "sort"
  );

  let findObj = {};

  findParams.forEach((item) => {
    switch (item) {
      case "email":
        findObj["user_info.email"] = { $regex: req.query[item], $options: "i" };
        break;
      case "id":
        findObj["_idStr"] = { $regex: req.query[item], $options: "i" };
        break;
      default:
        findObj[item] = { $regex: req.query[item], $options: "i" };
        break;
    }
  });

  let sortObj = {};

  let sortDateObj = {};

  const uniqueSortKeys = ["view", "like", "dislike", "totalCmt"];

  const sortKeys = ["createdAt"];

  if (Object.keys(sort).length > 0) {
    let unique = [];
    let uniqueValue;
    for (const [key, value] of Object.entries(sort)) {
      if (sortKeys.includes(key)) {
        sortDateObj[key] = Number(value);
      } else if (uniqueSortKeys.includes(key)) {
        unique.push(key);
        uniqueValue = Number(value);
      }
    }

    if (unique.length > 1) {
      throw new BadRequestError(
        `Only one sort key in ${uniqueSortKeys.join(", ")} is allowed`
      );
    } else if (unique.length > 0) {
      sortObj[unique[0]] = uniqueValue;
    }
  } else {
    sortDateObj = {
      createdAt: -1,
    };
  }

  const combinedSort = { ...sortObj, ...sortDateObj };

  const pipeline = [
    {
      $addFields: {
        _userIdStr: { $toString: "$user_id" },
      },
    },
    {
      $match: {
        _userIdStr: userId,
      },
    },
    {
      $match: findObj,
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
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        "user_info._id": 1,
        "user_info.email": 1,
        "user_info.avatar": 1,
        "user_info.name": 1,
        thumb: 1,
        duration: { $ifNull: ["$duration", 0] },
        type: 1,
        view: 1,
        like: 1,
        dislike: 1,
        createdAt: 1,
        totalCmt: 1,
        description: 1,
      },
    },
    {
      $sort: combinedSort,
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
        userIdStr: { $toString: "$user_id" },
      },
    },
    {
      $match: {
        $and: [{ _idStr: id }, { userIdStr: userId }],
      },
    },
    {
      $lookup: {
        from: "tags",
        let: { tagIds: "$tag" },
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
        as: "tag_info",
      },
    },
    {
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        tag_info: { $ifNull: ["$tag_info", []] },
        thumb: 1,
        video: 1,
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
  console.log("🚀 ~ id:", id);

  const { userId } = req.user;

  if (id === "" || id === ":id") {
    throw new BadRequestError("Please provide video id");
  }

  const foundedVideo = await Video.findOne({ user_id: userId });

  if (!foundedVideo) {
    throw new NotFoundError(`Cannot find video with id ${id}`);
  }

  if (foundedVideo.user_id.toString() !== userId) {
    throw new ForbiddenError("You are not authorized to update this video.");
  }

  if (
    Object.keys(req.body).length === 0 &&
    !req.files.image &&
    !req.files.image[0]
  ) {
    throw new BadRequestError("There is nothing to update.");
  }

  let updatedKey = ["title", "image", "type", "tag", "description"];

  let updateData = {};

  let emptyList = [];

  let notAllowValue = [];

  for (let [key, value] of Object.entries(req.body)) {
    if (updatedKey.includes(key)) {
      if (value === "") {
        emptyList.push(key);
      } else {
        if (key === "tag") {
          value = JSON.parse(value);
        }
        updateData[key] = value;
      }
    } else {
      notAllowValue.push(key);
    }
  }

  if (notAllowValue.length > 0) {
    throw new BadRequestError(
      `The comment cannot contain the following fields: ${notAllowValue.join(
        ", "
      )}`
    );
  }

  if (emptyList.length > 0) {
    throw new BadRequestError(`${emptyList.join(", ")} cannot be empty`);
  }

  if (req.files?.image && req.files?.image[0]) {
    updateData.thumb = req.files?.image[0].filename;
  }

  const video = await Video.findByIdAndUpdate(id, updateData);
  if (!video) {
    throw new InternalServerError(
      "These something went wrong with the server please try again later"
    );
  }

  if (req.files?.image && req.files?.image[0] && video) {
    const imgPath = path.join(asssetPath, "video thumb", video.thumb);
    deleteFile(imgPath);
  }

  res.status(StatusCodes.OK).json({ msg: "Video updated successfully" });
};

const deleteVideo = async (req, res) => {
  const { userId } = req.user;

  const { id } = req.params;

  if (id === "" || id === ":id") {
    throw new BadRequestError(`Video id cannot be empty`);
  }

  const foundedVideo = await Video.findById(id);

  if (!foundedVideo) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  if (userId !== foundedVideo.user_id.toString()) {
    throw new BadRequestError(
      `Video with id ${id} does not belong to your account`
    );
  }

  await Video.deleteOne({ _id: id });

  res.status(StatusCodes.OK).json({ msg: "Video deleted successfully" });
};

const deleteManyVideos = async (req, res) => {
  const { idList } = req.body;

  const { userId } = req.user;

  if (!idList) {
    throw new BadRequestError("Please provide idList");
  }
  if (!Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  const notBelongsToList = [];

  let notFoundedVideos = await Promise.all(
    idList.map(async (id) => {
      const video = await Video.findById(id);

      if (!video) {
        return id;
      }

      if (video.user_id.toString() !== userId) {
        notBelongsToList.push(id);
      }

      return null;
    })
  );

  notFoundedVideos = notFoundedVideos.filter((id) => id !== null);

  if (notFoundedVideos.length > 0) {
    throw new NotFoundError(
      `The following video IDs could not be found: ${notFoundedVideos.join(
        ", "
      )}`
    );
  }

  if (notBelongsToList.length > 0) {
    throw new BadRequestError(
      `The following video IDs : ${notBelongsToList.join(
        ", "
      )}. Does not belong to you `
    );
  }

  idList.forEach(async (id) => {
    await Video.deleteOne({ _id: id });
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
