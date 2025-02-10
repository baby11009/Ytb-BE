const { Playlist, Video } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");

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
    sort,
    videoLimit,
    ...matchParams
  } = req.query;
  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;
  const skip = (pageNumber - 1) * limitNumber;

  let matchObj = {
    type: { $nin: ["history", ...exCludeTypes] },
  };

  const matchFuncObj = {
    id: (syntax) => {
      matchObj["_idStr"] = syntax;
    },
    email: (syntax) => {
      matchObj["user_info.email"] = syntax;
    },
  };

  if (Object.keys(matchParams).length > 0) {
    for (const [key, value] of Object.entries(matchParams)) {
      const syntax = { $regex: value, $options: "i" };
      if (matchFuncObj[key] && value) {
        matchFuncObj[item](syntax);
      } else if (value) {
        matchObj[key] = syntax;
      }
    }
  }

  let uniqueSortObj = {};

  let sortDateObj = {};

  if (sort && Object.keys(sort).length > 0) {
    const uniqueSortKeys = ["size"];
    const sortKeys = ["createdAt", "title", "updatedAt"];
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
      uniqueSortObj[unique[0]] = uniqueValue;
    }
  } else {
    sortDateObj = {
      createdAt: -1,
    };
    uniqueSortObj = { size: 1 };
  }

  const combinedSort = { ...uniqueSortObj, ...sortDateObj };

  const pipeline = [
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$created_user_id" },
        size: { $size: "$itemList" },
      },
    },
    {
      $match: {
        userIdStr: userId,
      },
    },
    {
      $match: matchObj,
    },
    {
      $sort: combinedSort,
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

  const foundedPlaylist = await Playlist.findOne({ _id: id });

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  if (foundedPlaylist.created_user_id.toString() !== userId) {
    throw new ForbiddenError("You are not authorized to access this playlist");
  }

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
    throw new NotFoundError("Playlist not found");
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

  if (!id) {
    throw new BadRequestError("Please provide playlist id to update");
  }

  const bodyData = req.body;

  if (Object.keys(bodyData).length === 0) {
    throw new BadRequestError("Please provide atleast one data to update");
  }

  let matchObj;

  if (mongoose.Types.ObjectId.isValid(id)) {
    matchObj = {
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

    matchObj = {
      type: listType,
      created_user_id: userId,
    };
  }

  const foundedPlaylist = await Playlist.findOne(matchObj);

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  if (userId !== foundedPlaylist.created_user_id.toString()) {
    throw new ForbiddenError("You are not authorized to update this playlist");
  }

  const notAllowData = [];

  const updateDatas = {};

  const title = (value) => {
    if (foundedPlaylist.type === "personal")
      return next(new ForbiddenError("You can't modify personal playlist"));
    if (typeof value !== "string")
      return next(new ForbiddenError("Data type must be a string"));
    if (foundedPlaylist.title === value) {
      return next(
        new BadRequestError("The new title of playlist is still the same"),
      );
    } else {
      updateDatas.title = value;
    }
  };
  const privacy = (value) => {
    if (foundedPlaylist.type !== "playlist")
      throw new ForbiddenError("You can't modify this list");
    if (value === foundedPlaylist.privacy) {
      throw new BadRequestError(
        "The new privacy of playlist is still the same ",
      );
    } else {
      const validatePrivacy = ["private", "public"];
      if (!validatePrivacy.includes(value)) {
        return next(new BadRequestError("Invalid playlist type"));
      } else {
        updateDatas.privacy = value;
      }
    }
  };
  const move = async (value) => {
    if (typeof value !== "object")
      return next(
        new BadRequestError(
          "Data type must be an object with following properties from :(nummber > 0) ,  to : (number < list length )",
        ),
      );

    // Must reverse because we are display data in reverse order of itemList indexes
    const vidList = [...foundedPlaylist.itemList].reverse();

    const { from, to } = value;

    const fromValue = vidList[from];
    const toValue = vidList[to];
    if (fromValue && toValue) {
      vidList[from] = toValue;
      vidList[to] = fromValue;
    } else {
      return next(new BadRequestError("Invalid move action"));
    }

    vidList.reverse();

    await Playlist.updateOne(
      { _id: foundedPlaylist._id },
      { itemList: vidList },
    );
  };

  const updateList = async (videoIdList) => {
    if (videoIdList.length > 0 && foundedPlaylist.type) {
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

      const alreadyInPlaylistVideosId = videoIdList.reduce((acc, item) => {
        if (foundedPlaylist.itemList.includes(item)) {
          acc.push(item);
        }
        return acc;
      }, []);

      let notInplaylistVideosId = [];

      if (alreadyInPlaylistVideosId.length > 0) {
        await Playlist.updateOne(matchObj, {
          $pullAll: { itemList: alreadyInPlaylistVideosId },
        });

        notInplaylistVideosId = videoIdList.reduce((acc, item) => {
          if (!alreadyInPlaylistVideosId.includes(item)) {
            acc.push(item);
          }
          return acc;
        }, []);
      } else {
        notInplaylistVideosId = videoIdList;
      }

      if (notInplaylistVideosId.length > 0) {
        await Playlist.updateOne(matchObj, {
          $addToSet: { itemList: { $each: notInplaylistVideosId } },
        });
      }
    } else {
      await Playlist.updateOne({ _id: id }, { itemList: [] });
    }
  };

  const updateFuncObj = {
    playlist: {
      title,
      privacy,
      move,
      videoIdList: updateList,
    },
    watch_later: {
      move,
      videoIdList: updateList,
    },
    likded: {
      move,
    },
  };

  if (Object.keys(bodyData).length > 0) {
    for (const [key, value] of Object.entries(bodyData)) {
      const func = updateFuncObj[foundedPlaylist.type][key];

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
  }

  if (notAllowData.length > 0) {
    throw new BadRequestError(
      "You can't update these fields: " + notAllowData.join(", "),
    );
  }

  if (Object.keys(updateDatas).length > 0) {
    await Playlist.updateOne(matchObj, updateDatas);
  }

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

  const playlist = await Playlist.aggregate(pipeline);

  res
    .status(StatusCodes.OK)
    .json({ msg: "Playlist updated successfullly", data: playlist[0] });
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  const { userId } = req.user;

  const foundedPlaylist = await Playlist.findById(id);

  if (foundedPlaylist._id.toString() !== userId) {
    throw new ForbiddenError("You are not authorized to delete this playlist");
  }

  if (foundedPlaylist.type !== "playlist") {
    throw new ForbiddenError("Cannot delete this list");
  }

  await Playlist.deleteOne({ _id: id });

  res.status(StatusCodes.OK).json({ msg: "Playlist deleted successfully" });
};

const deleteManyPlaylist = async (req, res) => {
  const { userId } = req.user;

  const { idList } = req.body;

  if (!idList || idList.length === 0) {
    throw new BadRequestError("Must choose at least one playlist");
  }

  const foundedPlaylists = await Playlist.aggregate([
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    { $match: { _idStr: { $in: idList }, type: "playlist" } },
    {
      $project: {
        type: 1,
        created_user_id: 1,
      },
    },
  ]);

  if (foundedPlaylists.length === 0) {
    throw new NotFoundError(
      `The following playlists with id: ${idList.join(", ")}could not be found`,
    );
  }

  const foundedIdList = foundedPlaylists.map((item) => item._id.toString());

  const notFoundedId = idList.filter((id) => !foundedIdList.includes(id));

  if (notFoundedId.length > 0) {
    throw new NotFoundError(
      `The following playlists with id: ${notFoundedId.join(
        ", ",
      )} could not be found`,
    );
  }

  const notBelongList = [];

  const specialList = [];

  foundedPlaylists.forEach((playlist) => {
    if (playlist.created_user_id.toString() !== userId) {
      notBelongList.push(playlist._id.toString());
      return;
    }

    if (playlist.type !== "playlist") {
      specialList.push(playlist._id.toString());
    }
  });

  if (notBelongList.length > 0) {
    throw new ForbiddenError(
      `You are not able to delete these playlist with id : ${notBelongList.join(
        ", ",
      )} that the not belongs to your account`,
    );
  }

  if (specialList.length > 0) {
    throw new ForbiddenError(
      `Cannot delete these list with id : ${specialList.join(", ")}`,
    );
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
