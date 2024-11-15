const { Playlist, Video } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");

const createPlaylist = async (req, res) => {
  const { userId } = req.user;
  const { title, videoIdList = [] } = req.body;

  if (!title || title === "") {
    throw new BadRequestError("Please provide a playlist title");
  }

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
        ", "
      )} could not be found`
    );
  }

  if (foundedVideos[0]?.missingIds?.length > 0) {
    throw new NotFoundError(
      `The following videos with id: ${foundedVideos[0].missingIds.join(
        ", "
      )} could not be found`
    );
  }

  const playlist = await Playlist.create({
    created_user_id: userId,
    title,
    itemList: videoIdList,
  });

  res.status(StatusCodes.OK).json({ msg: "Created playlist successfully" });
};

const getPlaylists = async (req, res) => {
  const { userId } = req.user;
  const { sort, videoLimit } = req.query;
  const limit = Number(req.query.limit) || 5;
  const page = Number(req.query.page) || 1;
  const skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "sort"
  );

  let findObj = {};

  findParams.forEach((item) => {
    const syntax = { $regex: req.query[item], $options: "i" };
    if (item === "id") {
      findObj["_idStr"] = syntax;
    } else if (item === "email") {
      findObj["user_info.email"] = syntax;
    } else {
      findObj[item] = syntax;
    }
  });

  let sortObj = {};

  let sortDateObj = {};

  const uniqueSortKeys = ["size"];

  const sortKeys = ["createdAt", "title", "updatedAt"];

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
    sortObj = { size: 1 };
  }

  const combinedSort = { ...sortObj, ...sortDateObj };

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
      $match: findObj,
    },
    {
      $sort: combinedSort,
    },
    {
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
            $limit: 1,
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
    {
      $project: {
        _id: 1,
        created_user_id: 1,
        title: 1,
        itemList: 1,
        video_list: "$video_list",
        size: 1,
        type: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlists[0]?.data,
    qtt: playlists[0]?.data?.length,
    totalQtt: playlists[0]?.totalCount[0]?.total,
    currPage: page,
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
    {
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
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
    {
      $project: {
        _id: 1,
        created_user_id: 1,
        title: 1,
        itemList: 1,
        createdAt: 1,
        type: 1,
        video_list: "$video_list",
        size: { $size: "$itemList" },
      },
    },
  ];

  const playlist = await Playlist.aggregate(pipeline);

  if (playlist.length === 0) {
    throw new NotFoundError("Playlist not found");
  }

  res.status(StatusCodes.OK).json({
    data: playlist[0],
    qtt: playlist[0].size,
    videoLimit,
    currPage: videoPage,
    totalPages: Math.floor(playlist[0].size / Number(videoLimit)),
  });
};

const updatePlaylist = async (req, res) => {
  const { userId } = req.user;

  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide playlist id to update");
  }

  const { videoIdList, title, type } = req.body;

  if (!videoIdList && !title && !type) {
    throw new BadRequestError(
      "Please provide atleast videoIdList or title to update playlist"
    );
  }

  const foundedPlaylist = await Playlist.findById(id);

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  if (userId !== foundedPlaylist.created_user_id.toString()) {
    throw new ForbiddenError("You are not authorized to update this playlist");
  }

  if (title) {
    if (foundedPlaylist.title === title) {
      throw new BadRequestError("The new title of playlist is still the same");
    } else {
      await Playlist.updateOne({ _id: id }, { title });
    }
  }

  if (type) {
    if (type === foundedPlaylist.type) {
      throw new BadRequestError("The new type of playlist is still the same ");
    } else {
      const validateType = ["private", "public"];
      if (!validateType.includes(type)) {
        throw new BadRequestError("Invalid playlist type");
      } else {
        await Playlist.updateOne({ _id: id }, { type });
      }
    }
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
          ", "
        )} could not be found`
      );
    }

    if (foundedVideos[0]?.missingIds?.length > 0) {
      throw new NotFoundError(
        `The following videos with id: ${foundedVideos[0].missingIds.join(
          ", "
        )} could not be found`
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
        { $pullAll: { itemList: alreadyInPlaylistVideosId } }
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
        { $addToSet: { itemList: { $each: notInplaylistVideosId } } }
      );
    }
  } else if (videoIdList && videoIdList.length === 0) {
    await Playlist.updateOne({ _id: id }, { itemList: [] });
  }

  res.status(StatusCodes.OK).json({ msg: "Playlist updated successfullly" });
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  const { userId } = req.user;

  const foundedPlaylist = await Playlist.findById(id);

  if (foundedPlaylist._id.toString() !== userId) {
    throw new ForbiddenError("You are not authorized to delete this playlist");
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
        created_user_id: 1,
      },
    },
  ]);

  if (foundedPlaylists.length === 0) {
    throw new NotFoundError(
      `The following playlists with id: ${idList.join(", ")}could not be found`
    );
  }

  if (foundedPlaylists[0]?.missingIds?.length > 0) {
    throw new NotFoundError(
      `The following playlists with id: ${foundedPlaylists[0].missingIds.join(
        ", "
      )} could not be found`
    );
  }

  const notBelongList = foundedPlaylists.filter((playlist) => {
    if (playlist._id.toString() !== userId) {
      return playlist._id.toString();
    }
  });

  if (notBelongList.length > 0) {
    throw new ForbiddenError(
      `You are not authorized to delete these playlist with id : ${notBelongList.join(
        ", "
      )}`
    );
  }

  await Playlist.deleteMany({ _id: { $in: idList } });

  res.status(StatusCodes.OK).json({
    msg: `Successfully deleted playlist with following id: ${idList.join(
      ", "
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
