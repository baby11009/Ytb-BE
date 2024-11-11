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

// const getRandomShort = async (req, res) => {
//   let userId;
//   if (req.user) {
//     userId = req.user.userId;
//   }

//   const { watchedIdList = [], shortId } = req.query;

//   let size = 3;

//   const addFieldsObj = {};

//   let matchObj = {
//     $expr: { $eq: [{ $toLower: "$type" }, "short"] },
//   };

//   const pipeline = [
//     {
//       $lookup: {
//         from: "users",
//         localField: "user_id",
//         foreignField: "_id",
//         as: "channel_info",
//       },
//     },
//     {
//       $unwind: {
//         path: "$channel_info",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//     {
//       $lookup: {
//         from: "comments",
//         localField: "_id",
//         foreignField: "video_id",
//         as: "comment_list",
//       },
//     },
//   ];

//   if (userId) {
//     console.log("🚀 ~ userId:", userId);
//     addFieldsObj.userIdStr = { $toString: "$channel_info._id" };
//     // pipeline.push(
//     //   {
//     //     $lookup: {
//     //       from: "subscribes",
//     //       let: { channelId: "$channel_info._id" },
//     //       pipeline: [
//     //         {
//     //           $addFields: {
//     //             subscriberIdStr: { $toString: "$subscriber_id" },
//     //           },
//     //         },
//     //         {
//     //           $match: {
//     //             $expr: {
//     //               $and: [
//     //                 { $eq: ["$channel_id", "$$channelId"] },
//     //                 { $eq: [userId, "$subscriberIdStr"] },
//     //               ],
//     //             },
//     //           },
//     //         },
//     //         {
//     //           $project: {
//     //             subscriber_id: 1,
//     //             channel_id: 1,
//     //             notify: 1,
//     //           },
//     //         },
//     //       ],
//     //       as: "subscribe_info",
//     //     },
//     //   },
//     //   {
//     //     $unwind: {
//     //       path: "$subscribe_info",
//     //       preserveNullAndEmptyArrays: true,
//     //     },
//     //   }
//     // );

//     matchObj.userIdStr = { $ne: userId };
//   }

//   let foundedShort = [];

//   if (shortId) {
//     size = 2;
//     foundedShort = await Video.aggregate([
//       { $addFields: { _idStr: { $toString: "$_id" } } },
//       {
//         $match: { _idStr: shortId },
//       },
//       {
//         $lookup: {
//           from: "users",
//           localField: "user_id",
//           foreignField: "_id",
//           as: "user_info",
//         },
//       },
//       {
//         $unwind: {
//           path: "$user_info",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       {
//         $lookup: {
//           from: "comments",
//           localField: "_id",
//           foreignField: "video_id",
//           as: "comment_list",
//         },
//       },
//       {
//         $project: {
//           _id: 1,
//           title: 1, // Các trường bạn muốn giữ lại từ Video
//           "user_info._id": 1,
//           "user_info.email": 1,
//           "user_info.avatar": 1,
//           "user_info.name": 1,
//           tag: 1,
//           thumb: 1,
//           video: 1,
//           duration: { $ifNull: ["$duration", 0] },
//           type: 1,
//           view: 1,
//           like: 1,
//           disLike: 1,
//           createdAt: 1,
//           totalCmt: { $size: "$comment_list" },
//         },
//       },
//     ]);

//     watchedIdList.push(shortId);
//   }

//   if (watchedIdList.length > 0) {
//     addFieldsObj["_idStr"] = { $toString: "$_id" };
//     matchObj["_idStr"] = { $nin: watchedIdList };
//   }

//   pipeline.push(
//     {
//       $addFields: addFieldsObj,
//     },
//     {
//       $match: matchObj,
//     },
//     { $sample: { size } },
//     {
//       $project: {
//         _id: 1,
//         title: 1, // Các trường bạn muốn giữ lại từ Video
//         "channel_info._id": 1,
//         "channel_info.email": 1,
//         "channel_info.avatar": 1,
//         "channel_info.name": 1,
//         tag: 1,
//         thumb: 1,
//         video: 1,
//         duration: { $ifNull: ["$duration", 0] },
//         type: 1,
//         view: 1,
//         like: 1,
//         disLike: 1,
//         createdAt: 1,
//         // subscribe_info: { $ifNull: ["$subscribe_info", null] },
//         totalCmt: { $size: "$comment_list" },
//       },
//     }
//   );

//   const shorts = await Video.aggregate(pipeline);

//   let finalData = [...shorts];
//   if (foundedShort.length > 0) {
//     console.log("🚀 ~ foundedShort:", foundedShort);
//     finalData = [...foundedShort, ...finalData];
//   }
//   res.status(StatusCodes.OK).json({
//     data: finalData,
//   });
// };

// Lấy data channel, playlist và video

const getRandomShort = async (req, res) => {
  let userId;
  if (req.user) {
    userId = req.user.userId;
  }
  const { watchedIdList = [], shortId } = req.query;
  let size = 3;
  const addFieldsObj = {};
  let matchObj = {
    $expr: { $eq: [{ $toLower: "$type" }, "short"] },
  };
  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "channel_info",
      },
    },
    {
      $unwind: {
        path: "$channel_info",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  if (userId) {
    addFieldsObj.userIdStr = { $toString: "$channel_info._id" };

    matchObj.userIdStr = { $ne: userId };
  }

  let foundedShort = [];
  if (shortId) {
    size = 2;
    foundedShort = await Video.aggregate([
      { $addFields: { _idStr: { $toString: "$_id" } } },
      {
        $match: { _idStr: shortId },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ]);
    watchedIdList.push(shortId);
  }
  if (watchedIdList.length > 0) {
    addFieldsObj["_idStr"] = { $toString: "$_id" };
    matchObj["_idStr"] = { $nin: watchedIdList };
  }
  pipeline.push(
    {
      $addFields: addFieldsObj,
    },
    {
      $match: matchObj,
    },
    { $sample: { size } },
    {
      $project: {
        _id: 1,
      },
    }
  );
  const shorts = await Video.aggregate(pipeline);

  let finalData = [...shorts.map((item) => item._id)];
  if (foundedShort.length > 0) {
    finalData = [foundedShort[0]._id, ...finalData];
  }
  res.status(StatusCodes.OK).json({
    data: finalData,
  });
};

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

  if (type !== "short" && !tag && page < 3) {
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

  if (type) {
    videoPipeline.push({
      $match: {
        type,
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

  const validSortKey = ["createdAt", "updatedAt", "textAZ"];

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
        itemList: 1,
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

  let userId;

  if (req.user) {
    userId = req.user.userId;
  }

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

  if (userId) {
    // Subscription state
    pipeline.push({
      $lookup: {
        from: "subscribes",
        let: {
          videoOwnerId: "$user_id",
          subscriberId: new mongoose.Types.ObjectId(userId),
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
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              avatar: 1,
              subscriber: 1,
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
          subscriberId: new mongoose.Types.ObjectId(userId),
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
          {
            $project: {
              type: 1,
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

  pipeline.push(
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
      $project: {
        _id: 1,
        title: 1, // Các trường bạn muốn giữ lại từ Video
        channel_info: { $ifNull: ["$channel_info", null] },
        thumb: 1,
        video: 1,
        type: 1,
        view: 1,
        like: 1,
        dislike: 1,
        totalCmt: 1,
        createdAt: 1,
        description: 1,
        subscription_info: { $ifNull: ["$subscription_info", null] },
        react_info: { $ifNull: ["$react_info", null] },
        tag_info: { $ifNull: ["$tag_info", []] },
      },
    }
  );

  const video = await Video.aggregate(pipeline);

  if (!video) {
    throw new NotFoundError(`Not found video with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: video[0] });
};

const getVideoCmts = async (req, res) => {

  let userId;
  
  if (req?.user) {
    userId = req.user.userId;
  }

  const { videoId } = req.params;

  const { replyId, sort } = req.query;

  let limit = Number(req.query.limit) || 5;

  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "replyId"
  );

  const pipeline = [
    { $match: { video_id: new mongoose.Types.ObjectId(videoId) } },
  ];

  let findObj = {};

  findParams.forEach((item) => {
    if (item === "reply") {
      findObj["replied_cmt_id"] = { $exists: JSON.parse(req.query[item]) };
    } else if (item === "id") {
      findObj["_idStr"] = { $regex: req.query[item], $options: "i" };
    }
  });

  const validSortKey = ["createdAt", "top"];

  const sortObj = {};

  if (sort && Object.keys(sort).length > 0) {
    for (const [key, value] of Object.entries(sort)) {
      if (
        validSortKey.includes(key) &&
        (Number(value) === 1 || Number(value) === -1)
      ) {
        if (key === "top") {
          sortObj.interact = Number(value);
          pipeline.push({
            $addFields: {
              interact: { $sum: ["$like", "$dislike", "$replied_cmt_total"] },
            },
          });
          continue;
        }
        sortObj[`${key}`] = Number(value);
      }
    }
  } else {
    sortObj["createdAt"] = -1;
  }

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
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: "user_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $lookup: {
        from: "users", // Collection users mà bạn muốn join
        localField: "replied_user_id", // Trường trong collection videos (khóa ngoại)
        foreignField: "_id", // Trường trong collection users (khóa chính)
        pipeline: [{ $project: { name: 1, email: 1 } }],
        as: "replied_user_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: {
        path: "$replied_user_info",
        preserveNullAndEmptyArrays: true,
      },
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
        user_info: 1,
        react_info: { $ifNull: ["$react_info", null] },
        reply_comment_info: {
          $ifNull: ["$reply_comment_info", null],
        },
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        cmtText: 1,
        like: 1,
        dislike: 1,
        replied_parent_cmt_id: 1,
        replied_cmt_id: 1,
        replied_cmt_total: 1,
        createdAt: 1,
        interact: { $ifNull: ["$interact", null] },
      },
    },
    {
      $sort: sortObj,
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

  const countObj = {
    videoIdStr: videoId,
    replied_cmt_id: { $exists: false },
  };
  if (replyId) {
    countObj.replied_cmt_id = { $exists: true };
  }
  const totalData = await Comment.aggregate([
    { $addFields: { videoIdStr: { $toString: "$video_id" } } },
    { $match: countObj },
    { $count: "total" },
  ]);

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: totalData[0]?.count || 0,
    currPage: page,
    totalPage: Math.ceil(comments[0]?.totalCount[0]?.total / limit) || 1,
  });
};

module.exports = {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShort,
};
