const { Playlist, Video } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  InvalidError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { searchWithRegex } = require("../../utils/other");
const { PlaylistValidator, Validator } = require("../../utils/validate");

const createPlaylist = async (req, res) => {
  const { userId } = req.user;
  const { title, videoIdList = [], privacy } = req.body;

  if (!title || title === "") {
    throw new BadRequestError("Please provide a playlist title");
  }

  if (videoIdList && videoIdList.length > 0) {
    const foundedVideos = await Video.aggregate([
      {
        $addFields: {
          _idStr: { $toString: "$_id" },
        },
      },
      { $match: { _idStr: { $in: videoIdList } } },
      { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
      {
        $project: {
          missingIds: { $setDifference: [videoIdList, "$idsFound"] },
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
  }

  const playlist = await Playlist.create({
    created_user_id: userId,
    title,
    type: "playlist",
    privacy,
    itemList: videoIdList,
  });

  res
    .status(StatusCodes.OK)
    .json({ msg: "Created playlist successfully", data: playlist });
};

const getPlaylists = async (req, res) => {
  const { userId } = req.user;

  const {
    limit,
    page,
    exCludeTypes = [],
    videoLimit,
    sort,
    search,
  } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;
  const skip = (pageNumber - 1) * limitNumber;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {
    userIdStr: userId,
    type: { $nin: ["history", ...exCludeTypes] },
  };

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        validator.isString("title", title);
        searchObj["title"] = searchWithRegex(title);
      },
      privacy: (privacy) => {
        validator.isEnum("privacy", ["public", "private"], privacy);
        searchObj["privacy"] = privacy;
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
    const sortKeys = new Set(["createdAt", "title", "updatedAt", "size"]);

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
      $addFields: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$created_user_id" },
        size: { $size: "$itemList" },
      },
    },
    {
      $match: searchObj,
    },
    {
      $sort: sortObj,
    },
  ];

  if (videoLimit) {
    pipeline.push({
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          {
            $addFields: {
              _idStr: { $toString: "$_id" },
              reverseIdList: { $reverseArray: "$$videoIdList" },
            },
          },
          { $match: { $expr: { $in: ["$_idStr", "$reverseIdList"] } } },
          {
            $limit: Number(videoLimit),
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              video: 1,
              stream: {
                $cond: {
                  if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
                  then: "$stream", // Keep the `stream` value if it exists
                  else: null, // Set it to null if it doesn't exist
                },
              },
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    });
  }

  pipeline.push(
    {
      $project: {
        _id: 1,
        created_user_id: 1,
        title: 1,
        itemList: 1,
        video_list: "$video_list",
        size: 1,
        type: 1,
        privacy: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  );

  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlists[0]?.data,
    qtt: playlists[0]?.data?.length,
    totalQtt: playlists[0]?.totalCount[0]?.total,
    currPage: pageNumber,
    totalPage: Math.ceil(playlists[0]?.totalCount[0]?.total / limit),
  });
};

const getPlaylistDetails = async (req, res) => {
  const { userId } = req.user;

  const { id } = req.params;

  const { videoLimit = 8, videoPage = 1 } = req.query;

  const pipeline = [
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$created_user_id" },
      },
    },
    {
      $match: { _idStr: id, userIdStr: userId },
    },
  ];

  if (videoLimit && videoLimit > 0) {
    pipeline.push({
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          {
            $addFields: {
              _idStr: { $toString: "$_id" },
              reverseIdList: { $reverseArray: "$$videoIdList" },
            },
          },
          { $match: { $expr: { $in: ["$_idStr", "$reverseIdList"] } } },
          {
            $skip: (Number(videoPage) - 1) * Number(videoLimit),
          },
          {
            $limit: Number(videoLimit),
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              title: 1,
              type: 1,
              view: 1,
              like: 1,
              video: 1,
              stream: { $ifNull: ["$stream", null] },
              totalCmt: 1,
              description: 1,
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      created_user_id: 1,
      title: 1,
      createdAt: 1,
      privacy: 1,
      video_list: "$video_list",
      size: { $size: "$itemList" },
    },
  });

  const playlist = await Playlist.aggregate(pipeline);

  if (playlist.length === 0) {
    throw new NotFoundError("Not found playlist with id: " + id);
  }

  res.status(StatusCodes.OK).json({
    data: playlist[0],
    qtt: playlist[0].size,
    videoLimit: Number(videoLimit),
    currPage: Number(videoPage),
    totalPages: Math.ceil(playlist[0].size / Number(videoLimit)),
  });
};

const updatePlaylist = async (req, res, next) => {
  const { userId } = req.user;

  const { id } = req.params;

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError("Please provide atleast one data to update");
  }

  let searchObj;

  if (mongoose.Types.ObjectId.isValid(id)) {
    searchObj = {
      _id: id,
    };
  } else {
    const listTypes = {
      wl: "watch_later",
      liked: "liked",
      history: "history",
    };

    const listType = listTypes[id];

    if (!listType) {
      throw new BadRequestError("Invalid list id");
    }

    searchObj = {
      type: listType,
      created_user_id: userId,
    };
  }

  const foundedPlaylist = await Playlist.findOne({
    ...searchObj,
    created_user_id: userId,
  });

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  const { move, ...othersData } = req.body;

  let session;

  try {
    let bulkWrites = [];

    if (Object.keys(othersData).length > 0) {

      bulkWrites = await new PlaylistValidator(
        othersData,
        foundedPlaylist,
      ).getValidatedUpdateData();
    }

    if (move) {
      if (foundedPlaylist.itemList.length === 0) {
        throw new BadRequestError("Invalid move action");
      }

      if (typeof move !== "object" || !move.from || !move.to) {
        throw new BadRequestError(
          "Data type must be an object with following properties from : 'from video id' ,  to : 'to video id",
        );
      }

      if (move.from === move.to) {
        throw new BadRequestError("Cannot move video to itself");
      }

      const fromVideoIdIndex = foundedPlaylist.itemList.indexOf(move.from);

      const toVideoIdIndex = foundedPlaylist.itemList.indexOf(move.to);

      if (fromVideoIdIndex === -1 || toVideoIdIndex === -1) {
        throw new BadRequestError("Invalid move action");
      }

      bulkWrites.push({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              [`itemList.${fromVideoIdIndex}`]: move.to,
              [`itemList.${toVideoIdIndex}`]: move.from,
            },
          },
        },
      });
    }

    session = await mongoose.startSession();

    session.startTransaction();

    await Playlist.bulkWrite(bulkWrites, { session });

    const pipeline = [
      {
        $addFields: {
          _idStr: { $toString: "$_id" },
        },
      },
      {
        $match: { _idStr: id },
      },
      {
        $project: {
          _id: 1,
          created_user_id: 1,
          title: 1,
          itemList: 1,
          updatedAt: 1,
          type: 1,
          size: { $size: "$itemList" },
        },
      },
    ];

    const playlist = await Playlist.aggregate(pipeline, { session });

    await session.commitTransaction();
    res
      .status(StatusCodes.OK)
      .json({ msg: "Playlist updated successfullly", data: playlist[0] });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  const { userId } = req.user;

  const foundedPlaylist = await Playlist.findOne({
    _id: id,
    created_user_id: userId,
    type: "playlist",
  });

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  await Playlist.deleteOne({ _id: id });

  res.status(StatusCodes.OK).json({ msg: "Playlist deleted successfully" });
};

const deleteManyPlaylist = async (req, res) => {
  const { userId } = req.user;

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

  const foundedPlaylists = await Playlist.find({
    _id: { $in: idArray },
    created_user_id: userId,
    type: "playlist",
  }).select("_id type");

  if (foundedPlaylists.length === 0) {
    throw new NotFoundError(`No playlist found with these ids ${idList}`);
  }

  if (foundedPlaylists.length !== idArray.length) {
    const notFoundedList = [];

    foundedPlaylists.forEach((user) => {
      if (idArray.includes(user._id.toString())) {
        notFoundedList.push(user._id);
      }
    });

    throw new NotFoundError(
      `No playlist found with these ids : ${notFoundedList.join(", ")}`,
    );
  }

  await Playlist.deleteMany({ _id: { $in: idArray } });

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
