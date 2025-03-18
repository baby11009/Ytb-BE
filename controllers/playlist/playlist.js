const { Playlist, Video, User } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { searchWithRegex, isObjectEmpty } = require("../../utils/other");

const createPlaylist = async (req, res) => {
  const { title, videoIdList = [], userId, privacy } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new BadRequestError(`Not found user with id ${userId}`);
  }

  await Playlist.create({
    created_user_id: userId,
    title,
    itemList: videoIdList,
    privacy,
  });

  res.status(StatusCodes.OK).json({ msg: "Created playlist successfully" });
};

const getPlaylists = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        searchObj["title"] = searchWithRegex(title);
      },
      email: (email) => {
        searchObj["user_info.email"] = searchWithRegex(email);
      },
      name: (name) => {
        searchObj["user_info.name"] = searchWithRegex(name);
      },
      privacy: (privacy) => {
        searchObj["privacy"] = privacy;
      },
      type: (type) => {
        searchObj["type"] = type;
      },
    };

    for (const [key, value] of searchEntries) {
      if (searchFuncObj[key] && value) {
        searchFuncObj[key](value);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt", "updatedAt", "size"]);

    for (const [key, value] of sortEntries) {
      if (sortKeys.has(key)) {
        sortObj[key] = Number(value);
      }
    }
  }

  if (isObjectEmpty(sortObj)) {
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
              { case: { $eq: ["$type", "history"] }, then: "History" },
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

  if (isObjectEmpty(videoSortObj)) {
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
    data: playlistData,
    videoList: videoList,
    qtt: videoList?.length || 0,
    totalQtt: totalCount[0]?.total || 0,
    currPage: pageNum,
    totalPages: Math.ceil(totalCount[0]?.total / limitNum || 0),
  });
};

const updatePlaylist = async (req, res) => {
  const { id } = req.params;

  if (!id || id === "") {
    throw new BadRequestError("Please provide playlist id to update");
  }

  const bodyData = req.body;

  if (Object.keys(bodyData).length < 1) {
    throw new BadRequestError("Please provide at least one data to update");
  }

  const foundedPlaylist = await Playlist.findById(id);

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  const updateDatas = {};

  const notAllowData = [];

  const itemListBulkWrites = [];

  const title = (value) => {
    if (typeof value !== "string")
      throw new ForbiddenError("Data type must be a string");
    if (foundedPlaylist.title === value) {
      throw new BadRequestError("The new title of playlist is still the same");
    }
    updateDatas.title = value;
  };

  const privacy = (value) => {
    if (value === foundedPlaylist.privacy) {
      throw new BadRequestError(
        "The new privacy of playlist is still the same ",
      );
    }

    const validatePrivacy = new Set(["private", "public"]);
    if (!validatePrivacy.has(value)) {
      throw new BadRequestError("Invalid playlist privacy");
    }
    updateDatas.privacy = value;
  };

  const updateList = async (videoIdList) => {
    if (videoIdList?.length > 0) {
      const foundedVideos = await Video.aggregate([
        {
          $set: {
            _idStr: { $toString: "$_id" },
          },
        },
        { $match: { _idStr: { $in: videoIdList } } },
        { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
        {
          $project: {
            _id: 1,
            missingIds: {
              $setDifference: [videoIdList, "$idsFound"],
            },
          },
        },
      ]);

      if (foundedVideos.length === 0) {
        throw new NotFoundError(
          `The following videos with id: ${videoIdList.join(
            ", ",
          )} could not be found`,
        );
      }

      if (foundedVideos[0]?.missingIds?.length > 0) {
        throw new NotFoundError(
          `The following videos with id: ${foundedVideos[0].missingIds.join(
            ", ",
          )} could not be found`,
        );
      }

      const alreadyExistIds = [];
      const newVideoIds = [];

      const itemListSet = new Set(foundedPlaylist.itemList);

      videoIdList.forEach((id) => {
        if (itemListSet.has(id)) {
          alreadyExistIds.push(id);
        } else {
          newVideoIds.push(id);
        }
      });

      if (alreadyExistIds.length > 0) {
        itemListBulkWrites.push({
          updateOne: {
            filter: { _id: id },
            update: { $pull: { itemList: { $in: alreadyExistIds } } },
          },
        });
      }

      if (newVideoIds.length > 0) {
        itemListBulkWrites.push({
          updateOne: {
            filter: { _id: id },
            update: { $addToSet: { itemList: { $each: newVideoIds } } },
          },
        });
      }
    } else {
      itemListBulkWrites.push({ updateOne: { filter: { _id: id } } });
    }
  };

  const updateFuncObj = {
    playlist: {
      title,
      privacy,
      videoIdList: updateList,
    },
    watch_later: { videoIdList: updateList },
    history: { videoIdList: updateList },
  };

  for (const [key, value] of Object.entries(bodyData)) {
    let func = updateFuncObj[foundedPlaylist.type];
    if (func) {
      func = func[key];
    } else {
      throw new BadRequestError(
        `Cannot update playlist with type ${foundedPlaylist.type}`,
      );
    }

    if (func) {
      if (func.constructor.name === "AsyncFunction") {
        await func(value);
      } else {
        func(value);
      }
    } else {
      notAllowData.push(key);
    }
  }

  if (notAllowData.length > 0) {
    throw new BadRequestError(
      `Playlist with ${foundedPlaylist.type} type cannot modify these fields: ` +
        notAllowData.join(", "),
    );
  }

  const defaultBulkWrite = {
    updateOne: {
      filter: { _id: id },
      update: { $set: updateDatas },
    },
  };

  await Playlist.bulkWrite([defaultBulkWrite, ...itemListBulkWrites]);

  res.status(StatusCodes.OK).json({ msg: "Playlist updated successfullly" });
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  const playlist = await Playlist.findOne({ _id: id });

  if (!playlist) {
    throw new NotFoundError(`Playlist not found`);
  }

  if (playlist.type !== "playlist") {
    throw new ForbiddenError("You can't delete this list");
  }

  await Playlist.deleteOne({ _id: id });

  res.status(StatusCodes.OK).json({ msg: "Playlist deleted successfully" });
};

const deleteManyPlaylist = async (req, res) => {
  const { idList } = req.body;

  if (!idList || idList.length === 0) {
    throw new BadRequestError("Must choose at least one playlist");
  }

  const foundedPlaylists = await Playlist.aggregate([
    {
      $set: {
        _idStr: { $toString: "$_id" },
      },
    },
    { $match: { _idStr: { $in: idList } } },
    { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
    {
      $project: {
        missingIds: { $setDifference: [idList, "$idsFound"] },
        type: 1,
      },
    },
  ]);

  // if (foundedPlaylists.length === 0) {
  //   throw new NotFoundError(
  //     `The following playlists with id: ${idList.join(", ")}could not be found`,
  //   );
  // }

  if (foundedPlaylists[0]?.missingIds?.length > 0) {
    throw new NotFoundError(
      `The following playlists with id: ${foundedPlaylists[0].missingIds.join(
        ", ",
      )} could not be found`,
    );
  }

  const specialList = foundedPlaylists.filter((playlist) => {
    if (playlist.type !== "playlist") {
      return playlist._id.toString();
    }
  });

  if (specialList.length > 0) {
    throw new ForbiddenError("You can't delete these playlists");
  }

  await Playlist.deleteMany({ _id: { $in: idList } });

  res.status(StatusCodes.OK).json({
    msg: `Successfully deleted playlist with following id: ${idList.join(
      ", ",
    )}`,
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
