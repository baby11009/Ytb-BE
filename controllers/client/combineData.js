const { Video, Playlist, User } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError } = require("../../errors");
const mongoose = require("mongoose");

const getVideoList = async (req, res) => {
  const { limit, page, createdAt, tag, type, search, userId } = req.query;

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

  if (userId) {
    pipeline.push(
      {
        $addFields: {
          _idStr: { $toString: "$user_info._id" },
        },
      },
      {
        $match: {
          _idStr: { $eq: userId },
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

  let sortNum = -1;
  if (createdAt === "cũ nhất") {
    sortNum = 1;
  }

  pipeline.push(
    {
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
    },
    {
      $sort: { createdAt: sortNum },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: listLimit }],
      },
    }
  );

  const videos = await Video.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: videos[0]?.data,
    qtt: videos[0]?.data?.length,
    totalQtt: videos[0]?.totalCount[0]?.total,
    currPage: listPage,
    totalPages: Math.ceil(videos[0]?.totalCount[0]?.total / listLimit) || 0,
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

  const channel = await User.findOne({ email: email }).select(
    "-password -codeExpires -codeType -privateCode -updatedAt -__v"
  );

  if (!channel) {
    throw new NotFoundError("Not found channel");
  }

  res.status(StatusCodes.OK).json({ data: channel });
};

const getChannelPlaylistVideos = async (req, res) => {
  const { createdAt, limit, page, channelId } = req.query;

  const dataLimit = Number(limit) || 3;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;
  let sortNum = -1;
  if (createdAt === "cũ nhất") {
    sortNum = 1;
  }

  const pipeline = [];

  if (channelId) {
    pipeline.push(
      { $addFields: { _idStr: { $toString: "$created_user_id" } } },
      {
        $match: { _idStr: channelId },
      }
    );
  }

  pipeline.push(
    {
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          { $addFields: { _idStr: { $toString: "$_id" } } },
          { $match: { $expr: { $in: ["$_idStr", "$$videoIdList"] } } },
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
    {
      $project: {
        _id: 1,
        title: 1,
        video_list: 1,
        createdAt: 1,
      },
    },
    {
      $sort: {
        createdAt: sortNum,
      },
    },
    { $skip: skip },
    {
      $limit: dataLimit,
    }
  );

  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({ data: playlists });
};
module.exports = {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
};
