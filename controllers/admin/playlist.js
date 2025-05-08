const { Playlist, User } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  InvalidError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { searchWithRegex } = require("../../utils/other");
const { Validator } = require("../../utils/validate");
const {
  createPlaylistService,
  updatePlaylistService,
  deletePlaylistService,
  deleteManyPlaylistService,
} = require("../../service/playlist-service");

const createPlaylist = async (req, res) => {
  const { userId, ...tagData } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new BadRequestError(`Not found user with id ${userId}`);
  }

  await createPlaylistService(userId, tagData);

  res.status(StatusCodes.OK).json({ msg: "Created playlist successfully" });
};

const getPlaylists = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = { type: { $ne: "liked" } };

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        validator.isString("title", title);
        searchObj["title"] = searchWithRegex(title);
      },
      email: (email) => {
        validator.isString("email", email);

        searchObj["user_info.email"] = searchWithRegex(email);
      },
      name: (name) => {
        validator.isString("name", name);

        searchObj["user_info.name"] = searchWithRegex(name);
      },
      privacy: (privacy) => {
        validator.isEnum("privacy", ["public", "private"], privacy);
        searchObj["privacy"] = privacy;
      },
      type: (type) => {
        validator.isEnum("type", ["playlist", "watch_later"], type);

        searchObj["type"] = type;
      },
    };

    for (const [key, value] of searchEntries) {
      if (!searchFuncObj[key]) {
        errors.invalidKey.push(key);
        continue;
      }

      try {
        searchFuncObj[key](value);
      } catch (error) {
        errors.invalidValue.push(key);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt", "updatedAt", "size"]);

    const sortValueEnum = {
      1: 1,
      "-1": -1,
    };

    for (const [key, value] of sortEntries) {
      if (!sortKeys.has(key)) {
        errors.invalidKey(key);
        continue;
      }

      if (!sortValueEnum[value]) {
        errors.invalidValue(value);
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
    sortObj.createdAt = -1;
  }

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "created_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: "user_info",
      },
    },
    {
      $unwind: {
        path: "$user_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $set: {
        size: { $size: "$itemList" },
      },
    },
    {
      $match: searchObj,
    },
    {
      $lookup: {
        from: "videos",
        let: {
          lastVideoId: {
            $arrayElemAt: ["$itemList", { $subtract: ["$size", 1] }],
          },
        },
        pipeline: [
          {
            $set: {
              _idStr: { $toString: "$_id" },
            },
          },
          {
            $match: {
              $expr: {
                $eq: ["$_idStr", "$$lastVideoId"],
              },
            },
          },
          {
            $project: {
              thumb: 1,
            },
          },
        ],
        as: "video_info",
      },
    },
    {
      $unwind: {
        path: "$video_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        itemList: 1,
        user_info: 1,
        video_info: 1,
        size: 1,
        privacy: { $ifNull: ["$privacy", "Null"] },
        type: {
          $switch: {
            branches: [
              { case: { $eq: ["$type", "watch_later"] }, then: "Watch later" },
              { case: { $eq: ["$type", "liked"] }, then: "Liked" },
            ],
            default: "Playlist",
          },
        },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ];

  const playlists = await Playlist.aggregate(pipeline);

  const { data, totalCount } = playlists[0];

  res.status(StatusCodes.OK).json({
    data: data || [],
    qtt: data?.length || 0,
    totalQtt: totalCount[0]?.total || 0,
    currPage: pageNumber,
    totalPages: Math.ceil(totalCount[0]?.total / limit || 0),
  });
};

const getPlaylistDetails = async (req, res) => {
  const { id } = req.params;

  const { search, sort, videoLimit, videoPage } = req.query;

  const limitNum = Number(videoLimit) || 10;
  const pageNum = Number(videoPage) || 1;
  const skip = (pageNum - 1) * limitNum;

  const videoSearchObj = {
    $expr: {
      $in: ["$_idStr", "$$videoIds"],
    },
  };

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        videoSearchObj["title"] = searchWithRegex(title);
      },
    };

    for (const [key, value] of searchEntries) {
      if (searchFuncObj[key] && value) {
        searchFuncObj[key](value);
      }
    }
  }

  const videoSortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["order"]);

    for (const [key, value] of sortEntries) {
      if (sortKeys.has(key)) {
        videoSortObj[key] = Number(value);
      }
    }
  }

  if (Object.keys(videoSortObj).length < 1) {
    videoSortObj.order = -1;
  }

  const pipeline = [
    {
      $set: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: { _idStr: id },
    },
    {
      $lookup: {
        from: "users",
        localField: "created_user_id",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              email: 1,
              name: 1,
            },
          },
        ],
        as: "user_info",
      },
    },
    {
      $unwind: {
        path: "$user_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "videos",
        let: {
          videoIds: "$itemList",
        },
        pipeline: [
          {
            $set: {
              _idStr: { $toString: "$_id" },
            },
          },
          {
            $set: {
              order: {
                $indexOfArray: ["$$videoIds", "$_idStr"],
              },
            },
          },
          {
            $match: videoSearchObj,
          },
          {
            $sort: videoSortObj,
          },
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    name: 1,
                    email: 1,
                    avatar: 1,
                  },
                },
              ],
              as: "video_user_info",
            },
          },
          {
            $unwind: "$video_user_info",
          },
          {
            $project: {
              title: 1,
              thumb: 1,
              video_user_info: 1,
              order: 1,
            },
          },
          {
            $facet: {
              totalCount: [{ $count: "total" }],
              videoList: [{ $skip: skip }, { $limit: limitNum }],
            },
          },
        ],
        as: "video_info",
      },
    },
    {
      $unwind: {
        path: "$video_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        created_user_id: 1,
        video_info: { $ifNull: ["$video_info", null] },
        type: 1,
        privacy: 1,
        title: 1,
        itemList: 1,
        createdAt: 1,
        user_info: 1,
      },
    },
  ];

  const playlist = await Playlist.aggregate(pipeline);

  if (playlist.length === 0) {
    throw new NotFoundError("Playlist not found");
  }

  const {
    video_info: { videoList, totalCount },
    ...playlistData
  } = playlist[0];

  if (videoSortObj.order !== 1) {
    playlistData.itemList = playlistData.itemList.reverse();
  }

  res.status(StatusCodes.OK).json({
    playlistInfor: playlistData,
    videoList: {
      data: videoList,
      qtt: videoList?.length || 0,
      totalQtt: totalCount[0]?.total || 0,
      currPage: pageNum,
      totalPages: Math.ceil(totalCount[0]?.total / limitNum || 0),
    },
  });
};

const updatePlaylist = async (req, res) => {
  const { id } = req.params;

  if (Object.keys(req.body).length < 1) {
    throw new BadRequestError("Please provide at least one data to update");
  }

  try {
    await updatePlaylistService({ _id: id }, req.body);

    res.status(StatusCodes.OK).json({ msg: "Playlist updated successfullly" });
  } catch (error) {
    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }
    throw error;
  }
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  await deletePlaylistService(id);

  res.status(StatusCodes.OK).json({ msg: "Playlist deleted successfully" });
};

const deleteManyPlaylist = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError(
      "Please provide a list of playlist's id to delete",
    );
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  await deleteManyPlaylistService(idArray);

  res.status(StatusCodes.OK).json({
    msg: `Successfully deleted playlist with following id: ${idList}`,
  });
};

module.exports = {
  createPlaylist,
  getPlaylists,
  getPlaylistDetails,
  updatePlaylist,
  deletePlaylist,
  deleteManyPlaylist,
};
