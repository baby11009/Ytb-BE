const { Video, Playlist, User, Comment } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError } = require("../../errors");
const mongoose = require("mongoose");

const getVideoList = async (req, res) => {
  const { limit, page, tag, type, search, channelEmail, sort } = req.query;

  const listLimit = Number(limit) || 8;

  const listPage = Number(page) || 1;

  const skip = (listPage - 1) * listLimit;

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user_id",
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
  ];

  if (channelEmail) {
    pipeline.push(
      {
        $addFields: {
          email: "$user_info.email",
        },
      },
      {
        $match: {
          email: { $eq: channelEmail },
        },
      }
    );
  }

  if (search) {
    pipeline.push({
      $match: {
        title: { $regex: search, $options: "i" },
      },
    });
  }

  if (type) {
    pipeline.push({
      $match: {
        $expr: { $eq: [{ $toLower: "$type" }, type.toLowerCase()] },
      },
    });
  }

  if (tag) {
    pipeline.push(
      {
        $lookup: {
          from: "tags",
          let: { tagIds: "$tag" }, // Định nghĩa biến từ `localField` (mảng `tag`)
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
                icon: 1,
              },
            },
          ],
          as: "tag_info",
        },
      },
      {
        $match: {
          $expr: {
            $gt: [{ $size: "$tag_info" }, 0], // Chỉ lấy những posts có ít nhất một tag_info
          },
        },
      },
      {
        $addFields: {
          matching: {
            $filter: {
              input: "$tag_info",
              as: "tag",
              cond: { $eq: ["$$tag.slug", tag] }, // So khớp slug của tag với mảng inputTags
            },
          },
        },
      }
    );
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1, // Các trường bạn muốn giữ lại từ Video
      "user_info._id": 1,
      "user_info.email": 1,
      "user_info.avatar": 1,
      "user_info.name": 1,
      tag_info: 1,
      tag: 1,
      thumb: 1,
      duration: { $ifNull: ["$duration", 0] },
      type: 1,
      view: 1,
      like: 1,
      disLike: 1,
      createdAt: 1,
    },
  });

  const validSortKey = ["createdAt", "view"];

  const sortObj = {};

  if (sort && Object.keys(sort).length > 0) {
    for (const [key, value] of Object.entries(sort)) {
      if (
        validSortKey.includes(key) &&
        (Number(value) === 1 || Number(value) === -1)
      ) {
        sortObj[`${key}`] = Number(value);
      }
    }
  }
  // $sort sẽ dựa theo thứ tự điều kiện sort trong object
  pipeline.push({
    $sort: sortObj,
  });

  pipeline.push({
    $facet: {
      totalCount: [{ $count: "total" }],
      data: [{ $skip: skip }, { $limit: listLimit }],
    },
  });

  const videos = await Video.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: videos[0]?.data,
    qtt: videos[0]?.data?.length,
    totalQtt: videos[0]?.totalCount[0]?.total,
    currPage: listPage,
    totalPage: Math.ceil(videos[0]?.totalCount[0]?.total / listLimit) || 0,
  });
};

// Lấy data channel, playlist và video
const getDataList = async (req, res) => {
  const {
    limit,
    page,
    createdAt,
    tag,
    type,
    search,
    channelId,
    userId,
    prevPlCount = 0,
  } = req.query;

  const dataLimit = Number(limit) || 16;

  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  const channelList = [];

  const playlistList = [];

  // Get users when searching
  if (!channelId && search && page < 2) {
    const channelPipeline = [
      {
        $match: {
          name: { $regex: search, $options: "i" },
        },
      },
    ];

    if (userId) {
      channelPipeline.push(
        {
          $lookup: {
            from: "subscribes",
            let: {
              channelId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: [
                          "$subscriber_id",
                          new mongoose.Types.ObjectId(userId),
                        ],
                        $eq: ["$channel_id", "$$channelId"],
                      },
                    ],
                  },
                },
              },
            ],
            as: "subcribe_info",
          },
        },
        {
          $unwind: {
            path: "$subcribe_info",
            preserveNullAndEmptyArrays: true,
          },
        }
      );
    }
    channelPipeline.push(
      {
        $project: {
          _id: 1,
          email: 1,
          name: 1,
          avatar: 1,
          subscriber: 1,
          description: { $ifNull: ["$description", ""] },
          subcribe_info: { $ifNull: ["$subcribe_info", null] },
        },
      },
      {
        $sort: {
          subscriber: -1,
        },
      },
      {
        $limit: 2,
      }
    );
    const channels = await User.aggregate(channelPipeline);

    channelList.push(...channels);
  }

  let sortNum = -1;
  if (createdAt?.toLowerCase() === "cũ nhất") {
    sortNum = 1;
  }

  if (!type && !tag && page < 3) {
    const playlistPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "created_user_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                subscriber: 1,
              },
            },
          ],
          as: "user_info",
        },
      },
      {
        $unwind: "$user_info",
      },
    ];

    if (search) {
      playlistPipeline.push({
        $match: {
          title: { $regex: search, $options: "i" },
          // Public only playlist
          type: "public",
        },
      });
    }

    playlistPipeline.push(
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$itemList" },
          pipeline: [
            { $addFields: { _idStr: { $toString: "$_id" } } },
            {
              $match: {
                $expr: { $in: ["$_idStr", "$$videoIdList"] },
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 1,
                thumb: 1,
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
          user_info: 1,
          video_list: { $ifNull: ["$video_list", null] },
          videoCount: { $size: "$itemList" },
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        $sort: {
          createdAt: sortNum,
        },
      },
      {
        $skip: (dataPage - 1) * 2,
      },
      {
        $limit: 2,
      }
    );

    const playlists = await Playlist.aggregate(playlistPipeline);
    playlistList.push(...playlists);
  }

  const videoPipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, name: 1, email: 1, avatar: 1 } }],
        as: "user_info",
      },
    },
    {
      $unwind: "$user_info",
    },
  ];

  if (channelId) {
    videoPipeline.push(
      { $addFields: { _userIdStr: { $toString: "user_id" } } },
      {
        $match: { _userIdStr: channelId },
      }
    );
  }

  if (search) {
    videoPipeline.push({
      $match: {
        title: { $regex: search, $options: "i" },
      },
    });
  }

  if (tag) {
    videoPipeline.push(
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
                icon: 1,
              },
            },
          ],
          as: "tag_info",
        },
      },
      {
        $match: {
          $expr: {
            $gt: [{ $size: "$tag_info" }, 0], // Chỉ lấy những posts có ít nhất một tag_info
          },
        },
      },
      {
        $addFields: {
          matching: {
            $filter: {
              input: "$tag_info",
              as: "tag",
              cond: { $eq: ["$$tag.slug", tag] }, // So khớp slug của tag với mảng inputTags
            },
          },
        },
      }
    );
  }

  videoPipeline.push(
    { $sort: { createdAt: sortNum } },
    { $skip: skip - Number(prevPlCount) },
    { $limit: dataLimit - playlistList.length },
    {
      $project: {
        _id: 1,
        title: 1,
        thumb: 1,
        duration: { $ifNull: ["$duration", 0] },
        type: 1,
        view: 1,
        like: 1,
        disLike: 1,
        type: 1,
        tag_info: { $ifNull: ["$tag_info", null] },
        user_info: 1,
        createdAt: 1,
      },
    }
  );

  const videos = await Video.aggregate(videoPipeline);

  let finalData = [...videos];

  if (playlistList.length > 0) {
    for (let playlist of playlistList) {
      const position = Math.floor(Math.random() * finalData.length - 1);

      switch (position) {
        case position === 0:
          finalData = [playlist, ...finalData];
          break;
        case position === finalData.length - 1:
          finalData = [...finalData, playlist];
          break;
        default:
          finalData = [
            ...finalData.slice(0, position),
            playlist,
            ...finalData.slice(position, finalData.length),
          ];
      }
    }
  }

  let result = {
    data: finalData,
  };
  if (channelList.length > 0) {
    result.channels = channelList;
  }

  res.status(StatusCodes.OK).json(result);
};

const getChannelInfo = async (req, res) => {
  const { email } = req.params;
  const { userId } = req.query;

  const pipeline = [{ $match: { email: email } }];

  if (userId) {
    pipeline.push(
      {
        $lookup: {
          from: "subscribes",
          let: {
            channelId: "$_id",
            subscriberId: new mongoose.Types.ObjectId(userId),
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$channel_id", "$$channelId"] },
                    { $eq: ["$subscriber_id", "$$subscriberId"] },
                  ],
                },
              },
            },
          ],
          as: "subscription_info",
        },
      },
      {
        $unwind: {
          path: "$subscription_info",
          preserveNullAndEmptyArrays: true,
        },
      }
    );
  }

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      avatar: 1,
      banner: 1,
      subscriber: 1,
      totalVids: 1,
      createdAt: 1,
      "subscription_info.notify": {
        $ifNull: ["$subscription_info.notify", null],
      },
      "subscription_info._id": { $ifNull: ["$subscription_info._id", null] },
    },
  });

  const channel = await User.aggregate(pipeline);

  if (!channel) {
    throw new NotFoundError("Not found channel");
  }

  res.status(StatusCodes.OK).json({ data: channel });
};

const getChannelPlaylistVideos = async (req, res) => {
  const {
    limit,
    page,
    channelEmail,
    videoLimit = 12,
    sort = { createdAt: -1 },
  } = req.query;

  if (!channelEmail) {
    throw new BadRequestError("Please provide a channel email");
  }

  const dataLimit = Number(limit) || 3;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  const foundedChannel = await User.findOne({ email: channelEmail });

  if (!foundedChannel) {
    throw new NotFoundError("Channel not found");
  }

  const pipeline = [
    {
      $match: {
        created_user_id: foundedChannel._id,
        type: "public",
      },
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
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    name: 1,
                    email: 1,
                    avatar: 1,
                    subscriber: 1,
                    createdAt: 1,
                  },
                },
              ],
              as: "user_info",
            },
          },
          { $unwind: "$user_info" },
          {
            $limit: Number(videoLimit),
          },
          {
            $project: {
              _id: 1,
              thumb: 1,
              duration: { $ifNull: ["$duration", null] },
              view: 1,
              user_info: 1,
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
  ];

  const validSortKey = ["createdAt", "updatedAt"];

  const sortObj = {};

  if (sort && Object.keys(sort).length > 0) {
    for (const [key, value] of Object.entries(sort)) {
      if (
        validSortKey.includes(key) &&
        (Number(value) === 1 || Number(value) === -1)
      ) {
        sortObj[`${key}`] = Number(value);
      }
    }
  }

  // $sort sẽ dựa theo thứ tự điều kiện sort trong object
  pipeline.push({
    $sort: sortObj,
  });

  pipeline.push(
    {
      $project: {
        _id: 1,
        title: 1,
        video_list: { $reverseArray: "$video_list" },
        videoCount: { $size: "$itemList" },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    { $skip: skip },
    {
      $limit: dataLimit,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: dataLimit }],
      },
    }
  );
  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlists[0]?.data,
    qtt: playlists[0]?.data?.length,
    totalQtt: playlists[0]?.totalCount[0]?.total,
    currPage: dataPage,
    totalPage: Math.ceil(playlists[0]?.totalCount[0]?.total / dataLimit) || 0,
  });
};

const getVideoDetails = async (req, res) => {
  const { id } = req.params;

  const { subscriberId } = req.query;

  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "channel_info",
      },
    },
    {
      $unwind: "$channel_info",
    },
  ];

  if (subscriberId) {
    // Subscription state
    pipeline.push({
      $lookup: {
        from: "subscribes",
        let: {
          videoOwnerId: "$user_id",
          subscriberId: new mongoose.Types.ObjectId(subscriberId),
        },
        // pipeline để so sánh dữ liệu
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$channel_id", "$$videoOwnerId"] },
                  { $eq: ["$subscriber_id", "$$subscriberId"] },
                ],
              },
            },
          },
        ],
        as: "subscription_info",
      },
    });
    pipeline.push({
      $unwind: {
        path: "$subscription_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
    });

    pipeline.push({
      $lookup: {
        from: "reacts",
        let: {
          videoId: new mongoose.Types.ObjectId(id),
          subscriberId: new mongoose.Types.ObjectId(subscriberId),
        },
        // pipeline để so sánh dữ liệu
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$video_id", "$$videoId"] },
                  { $eq: ["$user_id", "$$subscriberId"] },
                ],
              },
            },
          },
        ],
        as: "react_info",
      },
    });
    pipeline.push({
      $unwind: {
        path: "$react_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1, // Các trường bạn muốn giữ lại từ Video
      "channel_info._id": 1,
      "channel_info.name": 1,
      "channel_info.avatar": 1,
      "channel_info.subscriber": 1,
      thumb: 1,
      video: 1,
      type: 1,
      view: 1,
      like: 1,
      disLike: 1,
      totalCmt: 1,
      createdAt: 1,
      "subscription_info.notify": {
        $ifNull: ["$subscription_info.notify", null],
      },
      "subscription_info._id": { $ifNull: ["$subscription_info._id", null] },
      "react_info._id": { $ifNull: ["$react_info._id", null] },
      "react_info.type": {
        $ifNull: ["$react_info.type", null],
      },
    },
  });

  const video = await Video.aggregate(pipeline);

  if (!video) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: video[0] });
};

const getVideoCmts = async (req, res) => {
  const { videoId } = req.params;

  const { replyId, userId, createdAt } = req.query;

  let limit = Number(req.query.limit) || 5;

  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) =>
      key !== "limit" &&
      key !== "page" &&
      key !== "createdAt" &&
      key !== "replyId" &&
      key !== "userId"
  );

  let findObj = {};

  findParams.forEach((item) => {
    if (item === "reply") {
      findObj["replied_cmt_id"] = { $exists: JSON.parse(req.query[item]) };
    } else if (item === "id") {
      findObj["_idStr"] = { $regex: req.query[item], $options: "i" };
    }
  });

  let sortNum = 1;

  if (createdAt === "mới nhất") {
    sortNum = -1;
  }

  const pipeline = [
    { $match: { video_id: new mongoose.Types.ObjectId(videoId) } },
  ];

  if (replyId) {
    pipeline.push({
      $match: { replied_cmt_id: { $exists: true } },
    });
    pipeline.push({
      $match: {
        $or: [
          { replied_parent_cmt_id: new mongoose.Types.ObjectId(replyId) },
          { replied_cmt_id: new mongoose.Types.ObjectId(replyId) },
        ],
      },
    });
  } else {
    pipeline.push({
      $match: { replied_cmt_id: { $exists: false } },
    });
  }

  if (userId) {
    pipeline.push(
      {
        $lookup: {
          from: "cmtreacts",
          let: {
            commentId: "$_id",
            userId: new mongoose.Types.ObjectId(userId),
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cmt_id", "$$commentId"] },
                    { $eq: ["$user_id", "$$userId"] },
                  ],
                },
              },
            },
          ],
          as: "react_info",
        },
      },
      {
        $unwind: {
          path: "$react_info",
          preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
        },
      }
    );
  }

  pipeline.push(
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
      $lookup: {
        from: "comments",
        let: {
          replyCmtId: "$replied_cmt_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$replyCmtId"],
              },
            },
          },
        ],
        as: "reply_comment_info",
      },
    },
    {
      $unwind: {
        path: "$reply_comment_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
    },
    {
      $lookup: {
        from: "users",
        let: {
          userId: "$reply_comment_info.user_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"],
              },
            },
          },
        ],
        as: "reply_user_info",
      },
    },
    {
      $unwind: {
        path: "$reply_user_info",
        preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
      },
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
        title: 1,
        "user_info._id": 1,
        "user_info.email": 1,
        "user_info.avatar": 1,
        "user_info.subscriber": { $ifNull: ["$user_info.subscribe", 0] },
        "react_info._id": { $ifNull: ["$react_info._id", null] },
        "react_info.type": { $ifNull: ["$react_info.type", null] },
        "reply_comment_info._id": {
          $ifNull: ["$reply_comment_info._id", null],
        },
        "reply_user_info.email": {
          $ifNull: ["$reply_user_info.email", null],
        },
        cmtText: 1,
        like: 1,
        dislike: 1,
        replied_parent_cmt_id: 1,
        replied_cmt_id: 1,
        replied_cmt_total: 1,
        createdAt: 1,
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
    }
  );

  let result = Comment.aggregate(pipeline);

  const comments = await result;

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(comments[0]?.totalCount[0]?.total / limit) || 1,
  });
};

module.exports = {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
};
