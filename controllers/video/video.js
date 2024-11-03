const { User, Video, Comment, CmtReact } = require("../../models");
const mongoose = require("mongoose");

const { StatusCodes } = require("http-status-codes");

const { BadRequestError, NotFoundError } = require("../../errors");

const { deleteFile, getVideoDuration } = require("../../utils/file");

const path = require("path");

const asssetPath = path.join(__dirname, "../../assets");

const upLoadVideo = async (req, res) => {
  const { image, video } = req.files;

  const {
    userId,
    type,
    title,
    tag = [],
    view = 0,
    like = 0,
    dislike = 0,
  } = req.body;

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

    const videoDuration = await getVideoDuration(video[0].path);

    const data = {
      user_id: userId,
      type: type,
      title: title,
      video: video[0].filename,
      thumb: image[0].filename,
      duration: videoDuration,
      tag: tag,
      view,
      like,
      dislike,
    };

    await Video.create(data);

    res.status(StatusCodes.CREATED).json({ msg: "Upload video successfully" });
  } catch (error) {
    if (video && video[0]) {
      deleteFile(video[0].path);
    }
    if (image && image[0]) {
      deleteFile(image[0].path);
    }
    throw error;
  }
};

const getVideos = async (req, res) => {
  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "createdAt"
  );

  let findObj = {};

  findParams.forEach((item) => {
    if (item === "email") {
      findObj["user_info.email"] = { $regex: req.query[item], $options: "i" };
    } else if (item === "id" && item !== "") {
      findObj["_idStr"] = { $regex: req.query[item], $options: "i" };
    } else {
      findObj[item] = { $regex: req.query[item], $options: "i" };
    }
  });
  let sortNum = -1;

  if (req.query.createdAt === "cũ nhất") {
    sortNum = 1;
  }

  const pipeline = [
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
      $match: findObj,
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
      },
    },
    {
      $sort: {
        createdAt: sortNum,
      },
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

  const video = await Video.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(id) }, // Lọc video theo id
    },
    {
      $lookup: {
        from: "users", // Tên của collection chứa thông tin user
        localField: "user_id", // Trường trong Video chứa user_id
        foreignField: "_id", // Trường trong User chứa _id
        as: "user_info", // Tên của trường mới chứa kết quả kết hợp
      },
    },
    {
      $unwind: "$user_info", // Tách kết quả kết hợp thành các tài liệu riêng lẻ
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
        "user_info._id": 1,
        "user_info.email": 1,
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
  if (!video) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: video[0] });
};

const updateVideo = async (req, res) => {
  const { id } = req.params;

  if (id === "" || id === ":id") {
    throw new BadRequestError("Please provide video id");
  }

  if (
    Object.keys(req.body).length === 0 &&
    !req.files.image &&
    !req.files.image[0]
  ) {
    throw new BadRequestError("There is nothing to update.");
  }

  let updatedKey = ["title", "view", "like", "dislike", "image", "type", "tag"];

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

  if (req.files?.image && req.files?.image[0]) {
    const imgPath = path.join(asssetPath, "video thumb", video.thumb);
    deleteFile(imgPath);
  }

  res.status(StatusCodes.OK).json({ msg: "Video updated successfully" });
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

  await Video.deleteOne({ _id: id });

  res.status(StatusCodes.OK).json({ msg: "Video deleted successfully" });
};

const deleteManyVideos = async (req, res) => {
  const { idList } = req.body;

  if (!idList) {
    throw new BadRequestError("Please provide idList");
  }
  if (!Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  let notFoundedVideos = await Promise.all(
    idList.map(async (id) => {
      const video = await Video.findById(id);

      if (!video) {
        return id;
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
