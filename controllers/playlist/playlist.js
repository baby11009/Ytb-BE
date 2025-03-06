const { Playlist, Video, User } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");

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

  let matchObj = { type: { $ne: "liked" } };

  const matchFuncObj = {
    id: (syntax) => {
      matchObj["_idStr"] = syntax;
    },
    email: (syntax) => {
      matchObj["user_info.email"] = syntax;
    },
  };

  if (Object.keys(search).length > 0) {
    for (const [key, value] of Object.entries(search)) {
      const syntax = { $regex: value, $options: "i" };
      if (matchFuncObj[key] && value) {
        matchFuncObj[key](syntax);
      } else if (value) {
        matchObj[key] = syntax;
      }
    }
  }

  let uniqueSortObj = {};

  let sortDateObj = {};

  const sortKeys = sort ? Object.keys(sort) : undefined;

  if (sortKeys && sortKeys.length > 0) {
    const uniqueSortKeys = ["size"];
    const defaultSortKeys = ["createdAt", "title", "updatedAt"];

    for (const key of sortKeys) {
      if (defaultSortKeys.includes(key)) {
        sortDateObj[key] = Number(sort[key]);
      } else if (uniqueSortKeys.includes(key)) {
        uniqueSortObj[key] = Number(sort[key]);
        if (Object.keys(uniqueSortObj).length > 1) {
          throw new BadRequestError(
            `Only one sort key in ${uniqueSortKeys.join(", ")} is allowed`,
          );
        }
      }
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
        user_info: 1,
        type: 1,
        privacy: 1,
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
          $addFields: {
            _idStr: { $toString: "$_id" },
          },
        },
        { $match: { _idStr: { $in: videoIdList } } },
        { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
        {
          $project: {
            itemList: 1,
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

      // Add the ID to the list if it does not exist; otherwise, remove it.
      const finalItemList = [
        ...videoIdList.filter((id) => !foundedPlaylist.itemList.includes(id)),
        ...foundedPlaylist.itemList.filter((id) => !videoIdList.includes(id)),
      ];

      updateDatas["itemList"] = finalItemList;
    } else {
      updateDatas["itemList"] = [];
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

  await Playlist.updateOne({ _id: id }, updateDatas);

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
