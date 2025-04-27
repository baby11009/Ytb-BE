const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  InvalidError,
  NotFoundError,
} = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const {
  Subscribe,
  User,
  Video,
  Playlist,
  WatchedHistory,
  Notification,
} = require("../../models");
const avatarPath = path.join(__dirname, "../../assets/user avatar");
const { UserValidator, Validator } = require("../../utils/validate");
const {
  isObjectEmpty,
  decodedWithZlib,
  encodedWithZlib,
} = require("../../utils/other");

const getAccountInfo = async (req, res) => {
  const { userId } = req.user;

  const user = await User.aggregate([
    { $match: { _id: userId } },
    {
      $lookup: {
        from: "subscribes",
        pipeline: [
          {
            $match: {
              subscriber_id: userId,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "channel_id",
              foreignField: "_id",
              pipeline: [
                { $project: { _id: 1, email: 1, name: 1, avatar: 1 } },
              ],
              as: "channel_info",
            },
          },
          {
            $unwind: {
              path: "$channel_info",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              "channel_info._id": 1,
              "channel_info.email": 1,
              "channel_info.name": 1,
              "channel_info.avatar": 1,
            },
          },
        ],
        as: "subscribed_list",
      },
    },
    {
      $project: {
        _id: 1,
        email: 1,
        name: 1,
        avatar: 1,
        banner: 1,
        role: 1,
        description: 1,
        subscriber: 1,
        totalVids: 1,
        description: 1,
        subscribed_list: 1,
        notReadedNotiCount: 1,
      },
    },
  ]);

  res.status(StatusCodes.OK).json({ data: user[0] });
};

const settingAccount = async (req, res) => {
  const id = req.user.userId;

  try {
    if (Object.keys(req.body).length === 0 && !req.files) {
      throw new BadRequestError("No data provided to update");
    }

    const foundedUser = await User.findOne({ _id: id });

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const updateDatas = await new UserValidator(
      { ...req.body, ...req.files },
      foundedUser,
      ["name", "password", "description", "avatar", "banner"],
    ).getValidatedUpdateData();

    await User.updateOne({ _id: id }, updateDatas);

    if (foundedUser.avatar !== "df.jpg" && updateDatas.avatar) {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg" && updateDatas.banner) {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    res.status(StatusCodes.OK).json({ msg: "User updated successfully" });
  } catch (error) {
    if (req.files?.avatar && req.files.avatar.length) {
      deleteFile(req.files.avatar[0].path);
    }

    if (req.files?.banner && req.files.banner.length) {
      deleteFile(req.files.banner[0].path);
    }

    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }
    throw error;
  }
};

const getSubscribedChannels = async (req, res) => {
  try {
    const { userId } = req.user;

    const { page, limit, sort } = req.query;

    const dataPage = Number(page) || 1;
    const dataLimit = Number(limit) || 12;
    const skip = (dataPage - 1) * dataLimit;

    const pipeline = [
      {
        $match: { subscriber_id: userId },
      },
      {
        $lookup: {
          from: "users",
          localField: "channel_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                email: 1,
                name: 1,
                avatar: 1,
                totalVids: 1,
                subscriber: 1,
                description: 1,
                updatedAt: 1,
              },
            },
          ],
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
    ];

    const sortObj = {};

    const sortEntries = Object.entries(sort || {});

    const errors = {
      invalidKey: [],
      invalidValue: [],
    };

    if (sortEntries.length > 0) {
      const sortKeys = new Set(["createdAt", "name", "channel_updatedAt"]);
      const sortEnum = {
        1: 1,
        "-1": -1,
      };

      for (const [key, value] of sortEntries) {
        if (!sortKeys.has(key)) {
          errors.invalidKey.push(key);
          continue;
        }

        if (!sortEnum[value]) {
          errors.invalidValue.push(key);
          continue;
        }

        sortObj[key] = sortEnum[value];
      }
    }

    for (const error in errors) {
      if (errors[error].length > 0) {
        return res.status(StatusCodes.BAD_REQUEST).json(errors);
      }
    }

    if (isObjectEmpty(sortObj)) {
      sortObj.createdAt = -1;
    }

    pipeline.push(
      {
        $project: {
          _id: 0,
          subcription_id: "$_id",
          channel_id: 1,
          name: "$channel_info.name",
          email: "$channel_info.email",
          avatar: "$channel_info.avatar",
          subscriber: "$channel_info.subscriber",
          description: "$channel_info.description",
          totalVids: "$channel_info.totalVids",
          channel_updatedAt: "$channel_info.updatedAt",
          notify: 1,
          createdAt: 1,
        },
      },
      {
        $sort: sortObj,
      },
      {
        $facet: {
          totalFound: [{ $count: "count" }],
          paginationData: [{ $skip: skip }, { $limit: dataLimit }],
        },
      },
      {
        $project: {
          totalFound: { $arrayElemAt: ["$totalFound.count", 0] }, // Tổng số bản ghi tìm thấy
          totalReturned: { $size: "$paginationData" }, // Tổng số trả về thực tế
          data: "$paginationData",
        },
      },
    );

    const channels = await Subscribe.aggregate(pipeline);
    res.status(StatusCodes.OK).json({
      data: channels[0].data,
      qtt: channels[0].totalReturned,
      totalQtt: channels[0].totalFound,
      currPage: dataPage,
      totalPage: Math.ceil(channels[0].totalFound / dataLimit),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const getSubscribedChannelsVideos = async (req, res) => {
  const { userId } = req.user;

  const { page, limit, sort, search } = req.query;

  const dataPage = Number(page) || 1;
  const dataLimit = Number(limit) || 12;
  const skip = (dataPage - 1) * dataLimit;

  const channels = await Subscribe.aggregate([
    {
      $match: {
        subscriber_id: userId,
      },
    },
    {
      $project: {
        channel_id: 1,
      },
    },
  ]);

  const resturnData = {
    data: [],
    qtt: 0,
    totalQtt: 0,
    currPage: dataPage,
    totalPage: 0,
  };

  if (channels.length > 0) {
    const channelIdList = channels.map((ch) => ch.channel_id);

    const validator = new Validator();

    const searchObj = {
      type: "video",
      user_id: { $in: channelIdList },
    };

    const searchEntries = Object.entries(search || {});

    const errors = {
      invalidKey: [],
      invalidValue: [],
    };

    if (searchEntries.length > 0) {
      const searchFuncObj = {
        type: (value) => {
          validator.isEnum("type", ["short", "video"], value);

          searchObj["type"] = value;
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
      const sortKeys = ["createdAt"];
      const sortValueEnum = {
        1: 1,
        "-1": -1,
      };

      for (const [key, value] of sortEntries) {
        if (!sortKeys.includes(key)) {
          errors.invalidKey.push(key);
          continue;
        }

        if (!sortValueEnum[value]) {
          errors.invalidValue.push(key);
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
        $match: searchObj,
      },
      {
        $sort: sortObj,
      },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                email: 1,
                name: 1,
                avatar: 1,
                subscriber: 1,
                description: 1,
              },
            },
          ],
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
      {
        $project: {
          _id: 1,
          title: 1,
          thumb: 1,
          channel_info: 1,
          createdAt: 1,
          like: 1,
          dislike: 1,
          type: 1,
          comment: 1,
          view: 1,
          duration: 1,
          description: 1,
          createdAt: 1,
        },
      },
      {
        $facet: {
          totalFound: [{ $count: "count" }],
          paginationData: [{ $skip: skip }, { $limit: dataLimit }],
        },
      },
      {
        $project: {
          totalFound: { $arrayElemAt: ["$totalFound.count", 0] }, // Tổng số bản ghi tìm thấy
          totalReturned: { $size: "$paginationData" }, // Tổng số trả về thực tế
          data: "$paginationData",
        },
      },
    ];

    const videos = await Video.aggregate(pipeline);

    resturnData.data = videos[0].data;
    resturnData.qtt = videos[0].totalReturned;
    resturnData.totalQtt = videos[0].totalFound;
    resturnData.totalPage = Math.ceil(videos[0].totalFound / dataLimit) || 0;
  }

  res.status(StatusCodes.OK).json(resturnData);
};

const getWatchLaterDetails = async (req, res) => {
  const { userId } = req.user;

  const { page, limit = 12, search } = req.query;

  const dataPage = Number(page) || 1;
  const dataLimit = Number(limit) || 12;
  const skip = (dataPage - 1) * dataLimit;

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  const validator = new Validator();

  const errors = { invalidKey: [], invalidValue: [] };

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      type: (type) => {
        validator.isEnum("type", ["video", "short"], type);

        searchObj.type = type;
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

  for (const error in errors) {
    if (errors[error].length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  const pipeline = [
    {
      $addFields: {
        created_user_idStr: { $toString: "$created_user_id" },
      },
    },
    {
      $match: {
        created_user_idStr: userId,
        type: "watch_later",
      },
    },
    {
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          {
            $addFields: {
              order: {
                $indexOfArray: ["$$videoIdList", { $toString: "$_id" }],
              },
            },
          },
          {
            $match: {
              $expr: { $in: [{ $toString: "$_id" }, "$$videoIdList"] },
              ...searchObj,
            },
          },
          {
            $sort: {
              order: -1, // Sắp xếp theo thứ tự tăng dần của `order`
            },
          },
          {
            $skip: skip,
          },
          {
            $limit: dataLimit,
          },
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
              as: "channel_info",
            },
          },
          {
            $unwind: "$channel_info",
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              title: 1,
              view: 1,
              type: 1,
              createdAt: 1,
              order: 1,
              duration: 1,
              channel_info: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        updatedAt: 1,
        video_list: "$video_list",
        size: { $size: "$itemList" },
      },
    },
  ];

  const playlist = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlist[0],
    currPage: dataPage,
    totalPage: Math.ceil(playlist[0].size / dataLimit),
  });
};

// Get liked video by using  liked videos playlist
const getLikedVideoList = async (req, res) => {
  const { userId } = req.user;

  const { page, limit = 12, search } = req.query;

  const dataPage = Number(page) || 1;
  const dataLimit = Number(limit) || 12;
  const skip = (dataPage - 1) * dataLimit;

  const matchObj = {};

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      type: (type) => {
        validator.isEnum("type", ["video", "short"], type);
        searchObj.type = type;
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

  for (const error in errors) {
    if (errors[error].length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  const pipeline = [
    {
      $addFields: {
        created_user_idStr: { $toString: "$created_user_id" },
        objectIdVideoList: {
          $map: {
            input: "$itemList",
            as: "id",
            in: { $toObjectId: "$$id" },
          },
        },
      },
    },
    {
      $match: {
        created_user_idStr: userId,
        type: "liked",
      },
    },
    {
      $lookup: {
        from: "videos",
        let: { videoIdList: "$objectIdVideoList" },
        pipeline: [
          {
            $addFields: {
              videoIdList: "$$videoIdList",
              order: {
                $indexOfArray: ["$$videoIdList", "$_id"],
              },
            },
          },
          {
            $match: {
              $expr: { $in: ["$_id", "$videoIdList"] },
              ...matchObj,
            },
          },
          {
            $sort: {
              order: -1, // Sắp xếp theo thứ tự tăng dần của `order`
            },
          },
          {
            $skip: skip,
          },
          {
            $limit: dataLimit,
          },
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
              as: "channel_info",
            },
          },
          {
            $unwind: "$channel_info",
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              title: 1,
              view: 1,
              type: 1,
              createdAt: 1,
              duration: 1,
              channel_info: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        updatedAt: 1,
        video_list: "$video_list",
        size: { $size: "$itemList" },
      },
    },
  ];

  const playlist = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlist[0],
    currPage: dataPage,
    totalPage: Math.ceil(playlist[0].size / dataLimit),
  });
};

const getNotificationList = async (req, res) => {
  const { userId } = req.user;

  const limit = Number(req.query.limit) || 12;
  const page = Number(req.query.page) || 1;
  const skip = limit * (page - 1);

  const notificationList = await Notification.aggregate([
    { $match: { receiver_user_id: userId } },
    {
      $lookup: {
        from: "users",
        localField: "sender_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { email: 1, name: 1, avatar: 1 } }],
        as: "sender_info",
      },
    },
    {
      $unwind: "$sender_info",
    },
    {
      $lookup: {
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        pipeline: [{ $project: { thumb: 1 } }],
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
      $lookup: {
        from: "comments",
        localField: "comment_id",
        foreignField: "_id",
        pipeline: [
          {
            $lookup: {
              from: "videos",
              localField: "video_id",
              foreignField: "_id",
              pipeline: [{ $project: { thumb: 1 } }],
              as: "video_info",
            },
          },
          { $unwind: "$video_info" },
          {
            $project: {
              video_info: 1,
              replied_cmt_id: 1,
              replied_parent_cmt_id: 1,
            },
          },
        ],
        as: "comment_info",
      },
    },
    {
      $unwind: {
        path: "$comment_info",
        preserveNullAndEmptyArrays: true, // giữ lại nếu không có video
      },
    },
    {
      $project: {
        sender_info: 1,
        video_info: { $ifNull: ["$video_info", null] },
        comment_info: { $ifNull: ["$comment_info", null] },
        message: 1,
        readed: 1,
        createdAt: 1,
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ]);

  res.status(StatusCodes.OK).json({
    data: notificationList[0]?.data,
    qtt: notificationList[0]?.data?.length,
    totalQtt: notificationList[0]?.totalCount[0]?.total,
    currPage: page,
    totalPage:
      Math.ceil(notificationList[0]?.totalCount[0]?.total / limit) || 1,
  });
};

const setUserHistoryList = async (req, res) => {
  const { userId } = req.user;
  const { videoId, watchedDuration } = req.body;

  const foundedVideo = await Video.findById(videoId).select(
    "_id type duration",
  );

  if (!foundedVideo) {
    throw new NotFoundError(`Not found video with id ${videoId}`);
  }

  if (watchedDuration > foundedVideo.duration) {
    throw new BadRequestError(
      `Watched duration cannot larger than video duration it self`,
    );
  }

  const foundedWatchedList = await WatchedHistory.findOne({
    user_id: userId,
    video_id: videoId,
  });

  if (foundedWatchedList) {
    await WatchedHistory.updateOne(
      { _id: foundedWatchedList._id },
      { last_watched_at: Date.now(), watched_duration: watchedDuration },
    );
  } else {
    await WatchedHistory.create({
      user_id: userId,
      video_id: videoId,
      video_type: foundedVideo.type,
      watched_duration: watchedDuration,
      last_watched_at: new Date(),
    });
  }

  res.status(StatusCodes.OK).send("Sucess full set history");
};

const getHistoryList = async (req, res) => {
  const { userId } = req.user;
  const { cursors, limit } = req.query;

  let cursorsData = null;

  if (cursors) {
    try {
      cursorsData = decodedWithZlib(cursors);
    } catch (e) {
      throw new BadRequestError("Invalid cursor format");
    }
  }

  const matchObj = {
    user_id: userId,
  };

  const buildPipeline = (type, base, limit, lastEndDate) => {
    //If no cursor is provided, we start fetching data from
    // before tomorrow at 00:00:00 (i.e., all history up to the end of today
    const startDateTime = lastEndDate
      ? new Date(lastEndDate)
      : new Date(new Date(Date.now() + 24 * 60 * 60 * 1000).setHours(0, 0, 0));

    const pipeline = [
      {
        $match: {
          ...base,
          last_watched_at: { $lt: startDateTime },
          video_type: type,
        },
      },
    ];

    if (lastId) {
      pipeline.push(
        { $set: { _idStr: { $toString: "$_id" } } },
        { $match: { $lt: lastId } },
      );
    }

    pipeline.push({
      $facet: {
        total: [{ $count: "size" }],
        data: [
          {
            $sort: {
              last_watched_at: -1,
            },
          },
          { $limit: limit },
          {
            $lookup: {
              from: "videos",
              localField: "video_id",
              foreignField: "_id",
              pipeline: [
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
                          subscriber: 1,
                          avatar: 1,
                        },
                      },
                    ],
                    as: "channel_info",
                  },
                },
                {
                  $unwind: "$channel_info",
                },
                {
                  $project: {
                    title: 1,
                    thumb: 1,
                    view: 1,
                    duration: 1,
                    description: {
                      $substrCP: ["$description", 0, 255], // substring from start to 100 characters
                    },
                    channel_info: 1,
                  },
                },
              ],
              as: "video_info",
            },
          },
          {
            $unwind: "$video_info",
          },
          {
            $project: {
              video_info: 1,
              watched_duration: 1,
              last_watched_at: 1,
            },
          },
        ],
      },
    });

    return pipeline;
  };

  const promiseList = [];

  const fetchingRules = {
    video: {
      condition: !cursorsData || cursorsData?.lastVideoEndDate,
      action: () => {
        const videoPipeline = buildPipeline(
          "video",
          matchObj,
          limit,
          cursorsData?.lastVideoEndDate,
        );

        promiseList.push(WatchedHistory.aggregate(videoPipeline));
      },
    },
    short: {
      condition: !cursorsData || cursorsData?.lastVideoEndDate,
      action: () => {
        const shortPipeline = buildPipeline(
          "short",
          matchObj,
          limit,
          cursorsData?.lastShortEndDate,
        );

        promiseList.push(WatchedHistory.aggregate(shortPipeline));
      },
    },
  };

  for (const rules of Object.values(fetchingRules)) {
    if (rules.condition) {
      rules.action();
    }
  }

  const [videos = [], shorts = []] = await Promise.all(promiseList);

  let nextCursors = null;

  if (videos.length && videos[0].total[0].size > videos[0].data.length) {
    nextCursors = {
      lastVideoEndDate:
        videos[0].data[videos[0].data.length - 1].last_watched_at,
    };
  }

  if (shorts.length && shorts[0].total[0].size > shorts[0].data.length) {
    nextCursors = {
      lastShortEndDate:
        shorts[0].data[shorts[0].data.length - 1].last_watched_at,
    };
  }

  let newCursors;
  if (nextCursors) {
    newCursors = encodedWithZlib(nextCursors);
  }

  res.status(200).json({ videos, shorts, nextCursors, newCursors });
};

module.exports = {
  
  getAccountInfo,
  getSubscribedChannels,
  settingAccount,
  getSubscribedChannelsVideos,
  getWatchLaterDetails,
  getLikedVideoList,
  getNotificationList,
};
