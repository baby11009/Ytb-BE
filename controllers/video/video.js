const { User, Video } = require("../../models");
const mongoose = require("mongoose");

const path = require("path");

const { StatusCodes } = require("http-status-codes");

const { BadRequestError, NotFoundError } = require("../../errors");

const { deleteFile, getVideoDuration } = require("../../utils/file");
const { createHls } = require("../../utils/createhls");
const { clearUploadedVideoFiles } = require("../../utils/clear");

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

    const videoPath = video[0].path; // Đường dẫn đến video vừa upload
    const filename = video[0].filename.split(".")[0];

    await createHls(filename, videoPath, type);

    const videoDuration = await getVideoDuration(video[0].path);

    const data = {
      user_id: userId,
      type: type,
      title: title,
      video: video[0].filename,
      stream: filename,
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
    let args = {};
    if (video & video[0]) {
      args.videoPath = video[0].path;
    }

    if (image & image[0]) {
      args.imagePath = image[0].path;
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

  let matchObj = {};

  const searchFuncsObj = {
    email: (email) => {
      matchObj["user_info.email"] = { $regex: email, $options: "i" };
    },
    id: (id) => {
      matchObj["_idStr"] = id;
    },
    type: (type) => {
      matchObj["type"] = type;
    },
  };

  const searchKeys = search ? Object.keys(search) : undefined;

  if (searchKeys && searchKeys.length > 0) {
    searchKeys.forEach((key) => {
      if (searchFuncsObj[key]) {
        searchFuncsObj[key](search[key]);
      }
    });
  }

  const sortObj = {};

  let sortDateObj = {};

  const uniqueSortKeys = [];

  const sortKeys = ["createdAt"];

  if (sort && Object.keys(sort).length > 0) {
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
        `Only one sort key in ${uniqueSortKeys.join(", ")} is allowed`,
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
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: matchObj,
    },
    {
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        user_info: 1,
        thumb: 1,
        video: 1,
        // stream: {
        //   $cond: {
        //     if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
        //     then: "$stream", // Keep the `stream` value if it exists
        //     else: null, // Set it to null if it doesn't exist
        //   },
        // },
        duration: { $ifNull: ["$duration", 0] },
        type: 1,
        view: 1,
        like: 1,
        dislike: 1,
        createdAt: 1,
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

  let updatedKey = ["title", "view", "like", "dislike", "type", "tag"];

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
        ", ",
      )}`,
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

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Video.deleteOne({ _id: id }, { session });
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({ msg: "Video deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const deleteManyVideos = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of video id to delete");
  }

  const idArray = idList.split(",");

  const foundedVideos = await Video.find({ _id: { $in: idArray } }).select(
    "_id",
  );

  if (foundedVideos.length === 0) {
    throw new NotFoundError(`Not found any video with these ids: ${idList}`);
  } else if (foundedVideos.length !== idArray.length) {
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

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Video.deleteMany({ _id: { $in: idArray } }, { session });
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({ msg: "Videos deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
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
