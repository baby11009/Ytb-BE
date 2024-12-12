const { User, Video } = require("../../models");
const mongoose = require("mongoose");

const fluentFFmpeg = require("fluent-ffmpeg");
const fs = require("fs");

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

  const videoPath = video[0].path; // Đường dẫn đến video vừa upload

  const filename = video[0].filename.split(".")[0];

  const resolutions = [
    {
      quality: 1080,
      scaleVideo: "scale=1920:1080",
      scaleShort: "scale=1080:1920",
    },
    // {
    //   quality: 720,
    //   scaleVideo: "scale=1280:720",
    //   scaleShort: "scale=720:1280",
    // },
    // {
    //   quality: 480,
    //   scaleVideo: "scale=854:480",
    //   scaleShort: "scale=480:854",q
    // },
    // {
    //   quality: 360,
    //   scaleVideo: "scale=640:360",
    //   scaleShort: "scale=360:640",
    // },
  ];

  const outputDir = "video segments";
  // create output folder if not exists
  // if (!fs.existsSync(path.join(asssetPath, outputDir))) {
  //   fs.mkdirSync(outputDir);
  // }

  const videoSegmentInfos = [];

  resolutions.forEach((resolution) => {
    const folderPath = path.join(
      asssetPath,
      outputDir,
      `${resolution.quality}p`,
      filename,
    );

    const filePath = path.join(folderPath, "hsl_output.m3u8");
    let result = { folderPath, filePath, quality: resolution.quality };
    switch (type) {
      case "video":
        result = { ...result, scale: resolution.scaleVideo };
        break;
      case "short":
        result = { ...result, scale: resolution.scaleShort };
        break;
      default:
        throw new BadRequestError("Invalid video type");
    }
    videoSegmentInfos.push(result);
  });

  let ffmpeg = fluentFFmpeg(videoPath);
  let ffmpeg2 = fluentFFmpeg(videoPath);

  try {
    const masterFolderPath = path.join(
      asssetPath,
      outputDir,
      "master",
      filename,
    );

    const masterFilePath = path.join(masterFolderPath, "master.m3u8");

    fs.mkdirSync(masterFolderPath);
    const fd = fs.openSync(masterFilePath, "w+");
    fs.closeSync(fd);

    for (const videoSegmentInfo of videoSegmentInfos) {
      fs.mkdirSync(videoSegmentInfo.folderPath);
      const fd = fs.openSync(videoSegmentInfo.filePath, "w+");
      fs.closeSync(fd);
      if (
        videoSegmentInfos.indexOf(videoSegmentInfo) !== 0 &&
        videoSegmentInfos.length > 1
      ) {
        ffmpeg2
          .output(videoSegmentInfo.filePath)
          .videoFilters(videoSegmentInfo.scale)
          .outputOptions([
            "-f hls",
            "-hls_time 10",
            "-hls_list_size 0",
            "-start_number 1",
            // `-hls_base_url ${safeBaseUrl}`,
          ]);
      }
    }

    const videoBaseUrl = "http://localhost:3000/api/v1/file/video/";

    const segmentBaseUrl = "http://localhost:3000/api/v1/file/segment/";
    const segmentSafeBaseUrl = encodeURI(
      segmentBaseUrl +
        filename +
        `?resolution=${videoSegmentInfos[0].quality}&hsl=`,
    );

    // Creating default resolution
    await new Promise((resolve, reject) => {
      ffmpeg
        .output(videoSegmentInfos[0].filePath)
        .videoFilters(videoSegmentInfos[0].scale)
        .outputOptions([
          "-f hls",
          "-hls_time 10",
          "-hls_list_size 0",
          "-start_number 1",
          `-hls_base_url ${segmentSafeBaseUrl}`,
        ])
        .on("stderr", (stderr) => {
          console.error("FFmpeg stderr:", stderr);
        })
        .on("stdout", (stdout) => {
          console.log("FFmpeg stdout:", stdout);
        })
        .on("end", () => {
          try {
            const resolution = videoSegmentInfos[0].scale
              .split("=")[1]
              .split(":")
              .join("x");

            let masterPlaylistContent =
              "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:1\n";

            const playlistUrl = encodeURI(
              videoBaseUrl +
                filename +
                "?type=stream&resolution=" +
                videoSegmentInfos[0].quality,
            );

            masterPlaylistContent += `#EXT-X-STREAM-INF:RESOLUTION=${resolution}\n${playlistUrl}\n`;

            // Ghi nội dung vào file master.m3u8
            fs.writeFileSync(masterFilePath, masterPlaylistContent);

            resolve();
          } catch (error) {
            throw error;
          }
        })
        .on("error", (err) => {
          reject(err);
        })
        .run();
    }).catch((error) => {
      throw error;
    });

    // ffmpeg2
    //   .on("stderr", (stderr) => {
    //     console.error("FFmpeg stderr:", stderr);
    //   })
    //   .on("stdout", (stdout) => {
    //     console.log("FFmpeg stdout:", stdout);
    //   })
    //   .on("end", () => {})
    //   .on("error", (err) => {
    //     throw err;
    //   })
    //   .run();
  } catch (error) {
    console.error("Lỗi khi tạo file:", error);
    throw error;
  }

  //  if video segments is not exited then create video segments

  // Tiến hành chia video thành các segment

  // const {
  //   userId,
  //   type,
  //   title,
  //   tag = [],
  //   view = 0,
  //   like = 0,
  //   dislike = 0,
  // } = req.body;

  // try {
  //   const fileErr = [];

  //   if (!video || video.length === 0) {
  //     fileErr.push("video");
  //   }

  //   if (!image || image.length === 0) {
  //     fileErr.push("image");
  //   }

  //   if (fileErr.length > 0) {
  //     throw new BadRequestError(`Please provide ${fileErr.join(", ")}`);
  //   }

  //   if (!userId) {
  //     throw new BadRequestError("Please provide user id");
  //   }

  //   const foundedUser = await User.findById(userId);

  //   if (!foundedUser) {
  //     throw new NotFoundError(`Not found user with id ${userId}`);
  //   }

  //   const videoDuration = await getVideoDuration(video[0].path);

  //   const data = {
  //     user_id: userId,
  //     type: type,
  //     title: title,
  //     video: video[0].filename,
  //     thumb: image[0].filename,
  //     duration: videoDuration,
  //     tag: tag,
  //     view,
  //     like,
  //     dislike,
  //   };

  //   await Video.create(data);

  //   res.status(StatusCodes.CREATED).json({ msg: "Upload video successfully" });
  // } catch (error) {
  //   if (video && video[0]) {
  //     deleteFile(video[0].path);
  //   }
  //   if (image && image[0]) {
  //     deleteFile(image[0].path);
  //   }
  //   throw error;
  // }

  res.send("OK");
};

const getVideos = async (req, res) => {
  const { sort } = req.query;

  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "sort",
  );

  let findObj = {};

  const findFuncObj = {
    email: (syntax) => {
      findObj["user_info.email"] = syntax;
    },
    id: (syntax) => {
      findObj["_idStr"] = syntax;
    },
  };

  findParams.forEach((item) => {
    const syntax = { $regex: req.query[item], $options: "i" };
    if (req.query[item]) {
      if (findFuncObj[item]) {
        findFuncObj[item](syntax);
      } else {
        findObj[item] = syntax;
      }
    }
  });

  const sortObj = {};

  let sortDateObj = {};

  const uniqueSortKeys = [];

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
    }),
  );

  notFoundedVideos = notFoundedVideos.filter((id) => id !== null);

  if (notFoundedVideos.length > 0) {
    throw new NotFoundError(
      `The following video IDs could not be found: ${notFoundedVideos.join(
        ", ",
      )}`,
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
