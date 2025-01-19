const { Playlist, Video } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");

const createPlaylist = async (req, res) => {
  const { title, videoIdList = [], userId, privacy } = req.body;

  if (!userId) {
    throw new BadRequestError("Please provide user create playlist id");
  }

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

  if (type && type === "personal") {
    throw new ForbiddenError("Cannot create personal playlist");
  }

  await Playlist.create({
    created_user_id: userId,
    title,
    itemList: videoIdList,
    type: "playlist",
    privacy,
  });

  res.status(StatusCodes.OK).json({ msg: "Created playlist successfully" });
};

const getPlaylists = async (req, res) => {
  const { limit, page, sort, ...matchParams } = req.query;
  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  let matchObj = {};

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
      $lookup: {
        from: "users",
        localField: "created_user_id",
        foreignField: "_id",
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
      $addFields: {
        _idStr: { $toString: "$_id" },
        _userIdStr: { $toString: "$created_user_id" },
        size: { $size: "$itemList" },
      },
    },
    {
      $match: matchObj,
    },
    {
      $project: {
        _id: 1,
        created_user_id: 1,
        title: 1,
        itemList: 1,
        createdAt: 1,
        "user_info._id": 1,
        "user_info.email": 1,
      },
    },
    {
      $sort: combinedSort,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ];

  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlists[0]?.data,
    qtt: playlists[0]?.data?.length,
    totalQtt: playlists[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(playlists[0]?.totalCount[0]?.total / limit),
  });
};

const getPlaylistDetails = async (req, res) => {
  const { id } = req.params;

  const pipeline = [
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: { _idStr: id, type: "playlist" },
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
      $project: {
        _id: 1,
        created_user_id: 1,
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

  res.status(StatusCodes.OK).json({ data: playlist[0] });
};

const updatePlaylist = async (req, res) => {
  const { id } = req.params;

  if (!id || id === "") {
    throw new BadRequestError("Please provide playlist id to update");
  }

  const { videoIdList, ...restData } = req.body;

  if (!videoIdList && !title) {
    throw new BadRequestError(
      "Please provide atleast videoIdList or title to update playlist",
    );
  }

  const foundedPlaylist = await Playlist.findById(id);

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  const updateDatas = {};

  const notAllowData = [];

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

  const updateFuncObj = {
    playlist: {
      title,
      privacy,
    },
  };

  if (Object.keys(restData).length > 0) {
    for (const [key, value] of Object.entries(restData)) {
      const func = updateFuncObj[foundedPlaylist.type][key];
      if (func) {
        const result = await func(value);

        if (result instanceof Promise) {
          return;
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
      await Playlist.updateOne(
        { _id: id },
        { $pullAll: { itemList: alreadyInPlaylistVideosId } },
      );

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
      await Playlist.updateOne(
        { _id: id },
        { $addToSet: { itemList: { $each: notInplaylistVideosId } } },
      );
    }
  } else if (videoIdList && videoIdList.length === 0) {
    await Playlist.updateOne({ _id: id }, { itemList: [] });
  }

  if (Object.keys(updateDatas).length > 0) {
    await Playlist.updateOne({ _id: id }, updateDatas);
  }

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
      $addFields: {
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

  if (foundedPlaylists.length === 0) {
    throw new NotFoundError(
      `The following playlists with id: ${idList.join(", ")}could not be found`,
    );
  }

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
