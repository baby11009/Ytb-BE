const { Playlist, Video } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");

const createPlaylist = async (req, res) => {
  const { title, videoIdList, userId } = req.body;

  if (!userId) {
    throw new BadRequestError("Please provide user create playlist id");
  }

  if (!title || title === "") {
    throw new BadRequestError("Please provide a playlist title");
  }

  if (!videoIdList || videoIdList.length === 0) {
    throw new BadRequestError("Please chose at least one video");
  }

  const { userId: id, role } = req.user;

  if (role !== "admin" && id !== userId) {
    throw new ForbiddenError("You can't create playlist for other user");
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
  const limit = Number(req.query.limit) || 5;
  const page = Number(req.query.page) || 1;

  const skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) =>
      key !== "limit" &&
      key !== "page" &&
      key !== "createdAt"
  );

  let findObj = {};

  findParams.forEach((item) => {
    const syntax = { $regex: req.query[item], $options: "i" };
    if (item === "id") {
      findObj["_idStr"] = syntax;
    } else if (item === "userId") {
      findObj["_userIdStr"] = syntax;
    } else if (item === "email") {
      findObj["user_info.email"] = syntax;
    } else {
      findObj[item] = syntax;
    }
  });

  console.log("🚀 ~ findObj:", findObj);

  let sortNum = 1;

  if (req.query.createdAt === "mới nhất") {
    sortNum = -1;
  }

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
      },
    },
    {
      $match: findObj,
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
        "user_info._id": 1,
        "user_info.email": 1,
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

  const { userId, role } = req.user;

  const { videoIdList, title } = req.body;

  if (!videoIdList && !title) {
    throw new BadRequestError(
      "Please provide atleast videoIdList or title to update playlist"
    );
  }

  const foundedPlaylist = await Playlist.findById(id);

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }
  if (
    role !== "admin" &&
    foundedPlaylist.created_user_id.toString() !== userId
  ) {
    throw new ForbiddenError(
      "You are not allowed to update playlist does not belong to your account"
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

  if (title) {
    if (foundedPlaylist.title === title) {
      throw new BadRequestError(
        "The new title of playlist is still the same as the old title"
      );
    } else {
      await Playlist.updateOne({ _id: id }, { title });
    }
  }

  res.status(StatusCodes.OK).json({ msg: "Playlist updated successfullly" });
};

const deletePlaylist = async (req, res) => {
  const { id } = req.params;

  const { userId, role } = req.user;

  const foundedPlaylist = await Playlist.findById(id);

  if (
    role !== "admin" &&
    foundedPlaylist.created_user_id.toString() !== userId
  ) {
    throw new ForbiddenError(
      "You are not allowed to delete playlist does not belong to your account"
    );
  }

  const playlist = await Playlist.deleteOne({ _id: id });

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
      },
    },
  ]);

  console.log("🚀 ~ foundedPlaylist:", foundedPlaylists);

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
