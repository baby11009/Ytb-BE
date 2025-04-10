const { Video, Playlist, User, Comment, Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const mongoose = require("mongoose");
const { Validator } = require("../../utils/validate");

const {
  client,
  connectRedis,
  disconnectRedis,
  addValue,
  setKeyExpire,
} = require("../../utils/redis");

const { generateSessionId } = require("../../utils/generator");
const { searchWithRegex } = require("../../utils/other");

const getVideoList = async (req, res) => {
  const { limit, page, sort } = req.query;

  const listLimit = Number(limit) || 8;

  const listPage = Number(page) || 1;

  const skip = (listPage - 1) * listLimit;

  const videoAddFieldsObj = {};

  const videoMatchObj = {};

  const pipeline = [
    {
      $set: videoAddFieldsObj,
    },
    {
      $match: videoMatchObj,
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
      $unwind: {
        path: "$channel_info",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  const queryFuncObj = {
    channelEmail: (value) => {
      pipeline.push(
        {
          $set: {
            email: "$channel_info.email",
          },
        },
        {
          $match: {
            email: { $eq: value },
          },
        },
      );
    },
    search: (value) => {
      videoMatchObj["title"] = { $regex: value, $options: "i" };
    },
    type: (value) => {
      videoMatchObj["type"] = value;
    },
    tag: (value) => {
      pipeline.push(
        {
          $lookup: {
            from: "tags",
            let: { tagIds: "$tags" },
            pipeline: [
              {
                $set: {
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
          $match: {
            $expr: {
              $gt: [
                // Get this data if it exists tag having the same slug with query
                {
                  $size: {
                    $filter: {
                      // Loop tag array and get all matching data
                      input: "$tag_info",
                      as: "t",
                      cond: { $eq: ["$$t.slug", value] }, // check if data have same slug with query slug
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      );
    },
  };

  for (const [key, value] of Object.entries(req.query)) {
    if (queryFuncObj[key] && value) {
      queryFuncObj[key](value);
    }
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1, // Các trường bạn muốn giữ lại từ Video
      channel_info: 1,
      tag_info: 1,
      video: 1,
      stream: {
        $cond: {
          if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
          then: "$stream", // Keep the `stream` value if it exists
          else: null, // Set it to null if it doesn't exist
        },
      },
      tags: 1,
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
  if (Object.keys(sortObj).length > 0) {
    pipeline.push({
      $sort: sortObj,
    });
  }

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

// const getRandomShorts = async (req, res) => {
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
//
//     addFieldsObj.userIdStr = { $toString: "$channel_info._id" };
//     // pipeline.push(
//     //   {
//     //     $lookup: {
//     //       from: "subscribes",
//     //       let: { channelId: "$channel_info._id" },
//     //       pipeline: [
//     //         {
//     //           $set: {
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
//       { $set: { _idStr: { $toString: "$_id" } } },
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
//       $set: addFieldsObj,
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
//
//     finalData = [...foundedShort, ...finalData];
//   }
//   res.status(StatusCodes.OK).json({
//     data: finalData,
//   });
// };

// Lấy data channel, playlist và video

const getRandomShorts = async (req, res) => {
  try {
    let id;

    if (Object.keys(req.params).length > 0) {
      id = req.params.id;
    }

    const { size = 1, type = "short" } = req.query;

    let userId;
    let sessionId;

    if (req.user) {
      userId = req.user.userId;
    } else {
      if (req.headers["session-id"]) {
        sessionId = req.headers["session-id"];
      } else {
        sessionId = generateSessionId();
      }
    }

    const pipeline = [];

    const addFieldsObj = {};

    const matchObj = {
      type,
    };

    const key = userId ? userId : sessionId;
    console.log("rediskey", key);
    res.set("session-id", key);
    res.set("Access-Control-Expose-Headers", "session-id");

    // connect redis
    await connectRedis();

    // check if redis key is available
    const watchedShortIdList = [];
    if (await client.exists(key)) {
      const idList = await client.sMembers(key);
      watchedShortIdList.push(...idList);
    }

    // if user provided short id and short id is not in the wacthed list
    if (id && !watchedShortIdList.includes(id)) {
      addFieldsObj["_idStr"] = { $toString: "$_id" };

      matchObj["_idStr"] = id;
    } else {
      if (watchedShortIdList && watchedShortIdList.length > 0) {
        addFieldsObj["_idStr"] = { $toString: "$_id" };

        matchObj["_idStr"] = { $nin: watchedShortIdList };
      }
    }

    if (Object.keys(addFieldsObj).length > 0) {
      pipeline.push({ $set: addFieldsObj });
    }

    pipeline.push({ $match: matchObj });

    pipeline.push(
      {
        $sample: { size: Number(size) },
      },
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
              },
            },
          ],
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
    );

    if (userId) {
      // Subscription state
      pipeline.push(
        {
          $lookup: {
            from: "subscribes",
            let: {
              videoOwnerId: "$user_id",
              subscriberId: new mongoose.Types.ObjectId(userId),
            },
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
                  notify: 1,
                },
              },
            ],
            as: "subscription_info",
          },
        },
        {
          $unwind: {
            path: "$subscription_info",
            preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
          },
        },
      );

      pipeline.push(
        {
          $lookup: {
            from: "reacts",
            let: {
              videoId: "$_id",
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
        },
        {
          $unwind: {
            path: "$react_info",
            preserveNullAndEmptyArrays: true, // Ensure video is returned even if no subscription exists
          },
        },
      );
    }

    pipeline.push(
      {
        $lookup: {
          from: "tags",
          let: { tagIds: "$tags" },
          pipeline: [
            {
              $set: {
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
          stream: {
            $cond: {
              if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
              then: "$stream", // Keep the `stream` value if it exists
              else: null, // Set it to null if it doesn't exist
            },
          },
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
      },
    );

    const shorts = await Video.aggregate(pipeline);

    const totalData = await Video.countDocuments({ type: "short" });

    let remainData = Math.max(
      0,
      totalData - (watchedShortIdList.length + shorts.length),
    );

    // add new shorts id to redis list
    if (shorts.length > 0) {
      await addValue(
        key,
        shorts.map((short) => short._id.toString()),
      );
    }

    // set expire of the list or refresh the list if it was created
    await setKeyExpire(key, 300);
    // disconnect redis
    await disconnectRedis();

    res.status(StatusCodes.OK).json({ data: shorts, remain: remainData });
  } catch (error) {
    if (error.message === "Socket already opened") {
      await disconnectRedis();
    } else {
      throw error;
    }
  }
};

const getDataList = async (req, res) => {
  const {
    limit,
    page,
    sort,
    tag,
    type = "all",
    split,
    search,
    channelEmail,
    prevPlCount = 0,
    watchedVideoIdList = [],
    watchedPlIdList = [],
  } = req.query;

  const userId = req?.user?.userId;

  const dataLimit = Number(limit) || 16;
  const dataPage = Number(page) || 1;
  const skip = (dataPage - 1) * dataLimit;

  const channelList = [];
  const playlistList = [];
  const videoAddFieldsObj = {};
  const videoMatchObj = {};
  const sortObj = {};

  const videoPipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, name: 1, email: 1, avatar: 1 } }],
        as: "channel_info",
      },
    },
    {
      $unwind: "$channel_info",
    },
  ];

  // Sorting objects
  if (sort && Object.keys(sort).length > 0) {
    const validSortKey = ["createdAt", "view"];
    for (const [key, value] of Object.entries(sort)) {
      if (
        validSortKey.includes(key) &&
        (Number(value) === 1 || Number(value) === -1)
      ) {
        sortObj[`${key}`] = Number(value);
      }
    }
  } else if (watchedVideoIdList.length > 0) {
    videoAddFieldsObj["_idStr"] = { $toString: "$_id" };
    videoMatchObj["_idStr"] = { $nin: watchedVideoIdList };
  }

  // Get users when searching
  if (!channelEmail && search && dataPage < 2 && !tag) {
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
        },
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
      },
    );
    const channels = await User.aggregate(channelPipeline);

    channelList.push(...channels);
  }

  // Get playlist if type is not short , user don't provide tag and page < 3
  if (
    !channelEmail &&
    type !== "short" &&
    !tag &&
    dataPage < 3 &&
    Object.keys(sortObj).length === 0
  ) {
    const addFieldsObj = { _idStr: { $toString: "$_id" } };

    const matchObj = {
      type: "playlist",
      privacy: "public",
      _idStr: { $nin: watchedPlIdList },
      itemList: { $ne: [] },
    };

    if (search) {
      matchObj["title"] = { $regex: search, $options: "i" };
    }

    const playlistPipeline = [
      {
        $set: {
          ...addFieldsObj,
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
        $match: matchObj,
      },
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
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$objectIdVideoList" },
          pipeline: [
            {
              $set: {
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
          ],
          as: "videos",
        },
      },
      {
        $set: {
          count: { $size: "$videos" },
        },
      },
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$objectIdVideoList" },
          pipeline: [
            {
              $set: {
                videoIdList: "$$videoIdList",
                order: {
                  $indexOfArray: ["$$videoIdList", "$_id"],
                },
              },
            },
            {
              $match: {
                $expr: { $in: ["$_id", "$videoIdList"] },
              },
            },
            {
              $sort: {
                order: -1, // Sắp xếp theo thứ tự tăng dần của `order`
              },
            },
            {
              $limit: 1,
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
      },
    ];

    playlistPipeline.push({ $sample: { size: 2 } });

    playlistPipeline.push({
      $project: {
        _id: 1,
        title: 1,
        channel_info: 1,
        video_list: { $ifNull: ["$video_list", []] },
        size: { $size: "$itemList" },
        createdAt: 1,
        updatedAt: 1,
      },
    });

    const playlists = await Playlist.aggregate(playlistPipeline);

    playlistList.push(...playlists);
  }

  const queryFuncObj = {
    channelEmail: (value) => {
      videoMatchObj["channel_info.email"] = channelEmail;
    },
    search: (value) => {
      videoMatchObj["title"] = { $regex: value, $options: "i" };
    },
    type: (value) => {
      if (type === "all" && split) {
        videoMatchObj["type"] = "video";
      } else if (type !== "all") {
        videoMatchObj["type"] = value;
      }
    },
    tag: (value) => {
      videoPipeline.push(
        {
          $lookup: {
            from: "tags",
            let: { tagIds: "$tags" },
            pipeline: [
              {
                $set: {
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
              $gt: [{ $size: "$tag_info" }, 0], // Get data if it's have more than one tag
            },
          },
        },
        {
          $match: {
            $expr: {
              $gt: [
                // Get this data if it exists tag having the same slug with query
                {
                  $size: {
                    $filter: {
                      // Loop tag array and get all matching data
                      input: "$tag_info",
                      as: "t",
                      cond: { $eq: ["$$t.slug", value] }, // check if data have same slug with query slug
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      );
    },
  };

  if (Object.keys(req.query).length > 0) {
    for (const [key, value] of Object.entries(req.query)) {
      if (queryFuncObj[key] && value) {
        queryFuncObj[key](value);
      }
    }
  }

  if (Object.keys(videoAddFieldsObj).length > 0) {
    videoPipeline.push({
      $set: videoAddFieldsObj,
    });
  }

  if (Object.keys(videoMatchObj).length > 0) {
    videoPipeline.push({
      $match: videoMatchObj,
    });
  }

  if (Object.keys(sortObj).length > 0) {
    videoPipeline.push(
      { $sort: sortObj },
      { $skip: skip - Number(prevPlCount) },
      { $limit: dataLimit - playlistList.length },
    );
  } else {
    videoPipeline.push({ $sample: { size: dataLimit - playlistList.length } });
  }

  videoPipeline.push({
    $project: {
      _id: 1,
      title: 1,
      thumb: 1,
      video: 1,
      stream: {
        $cond: {
          if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
          then: "$stream", // Keep the `stream` value if it exists
          else: null, // Set it to null if it doesn't exist
        },
      },
      duration: { $ifNull: ["$duration", 0] },
      type: 1,
      view: 1,
      type: 1,
      channel_info: 1,
      createdAt: 1,
    },
  });

  const videos = await Video.aggregate(videoPipeline);

  let shorts;

  if (type === "all" && split) {
    const shortPipeline = [...videoPipeline];
    // modify to get short only
    shortPipeline.forEach((item) => {
      if (item["$match"] && item["$match"]["type"]) {
        item["$match"]["type"] = "short";
      } else if (item["$sample"] && item["$sample"]["size"]) {
        item["$sample"]["size"] = dataLimit;
      }
    });

    shorts = await Video.aggregate(shortPipeline);
  }

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
    page: dataPage,
  };

  if (channelList.length > 0) {
    result.channels = channelList;
  }

  if (shorts) {
    result.shorts = shorts;
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
            {
              $project: {
                notify: 1,
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
      },
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
      description: 1,
      subscription_info: {
        $ifNull: ["$subscription_info", null],
      },
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
        type: "playlist",
        privacy: "public",
      },
    },
    {
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          {
            $set: {
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
              as: "channel_info",
            },
          },
          { $unwind: "$channel_info" },
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
              duration: { $ifNull: ["$duration", null] },
              view: 1,
              channel_info: 1,
              createdAt: 1,
            },
          },
        ],
        as: "video_list",
      },
    },
  ];

  const sortObj = {};

  const validSortKey = ["createdAt", "updatedAt", "textAZ"];

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
  if (Object.keys(sortObj).length > 0) {
    pipeline.push({
      $sort: sortObj,
    });
  }

  pipeline.push(
    {
      $project: {
        _id: 1,
        title: 1,
        video_list: 1,
        size: { $size: "$itemList" },
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
    },
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
        pipeline: [
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
              notify: 1,
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
        let: { tagIds: "$tags" },
        pipeline: [
          {
            $set: {
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
        stream: {
          $cond: {
            if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
            then: "$stream", // Keep the `stream` value if it exists
            else: null, // Set it to null if it doesn't exist
          },
        },
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
    },
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

  const { limit, page, search, sort } = req.query;

  const limitNum = Number(limit) || 5;

  const pageNum = Number(req.query.page) || 1;

  const skip = (pageNum - 1) * limitNum;

  const setObj = {};

  const searchObj = {
    video_id: new mongoose.Types.ObjectId(videoId),
    replied_parent_cmt_id: { $exists: false },
  };

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      replyId: (replyId) => {
        searchObj["replied_parent_cmt_id"] = new mongoose.Types.ObjectId(
          replyId,
        );
      },
    };

    for (const [key, value] of searchEntries) {
      if (searchFuncObj[key]) {
        searchFuncObj[key](value);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const validSortKey = ["createdAt"];
    const specialSort = {
      interact: (value) => {
        setObj["interact"] = {
          $sum: ["$like", "$dislike", "$replied_cmt_total"],
        };
        sortObj.interact = value;
      },
    };
    const sortValueEnum = {
      1: 1,
      "-1": -1,
    };
    for (const [key, value] of sortEntries) {
      if (validSortKey.includes(key) && sortValueEnum[value]) {
        sortObj[`${key}`] = sortValueEnum[value];
      } else if (specialSort[key] && sortValueEnum[value]) {
        specialSort[key](sortValueEnum[value]);
      }
    }
  }

  if (Object.keys(sortObj).length < 1) {
    sortObj.createdAt = -1;
  }

  const pipeline = [{ $set: setObj }, { $match: searchObj }];

  // Get user comment react infomation if user had logged in
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
      },
    );
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: "user_info",
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $lookup: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1 } }],
        as: "replied_user_info",
      },
    },
    {
      $unwind: {
        path: "$replied_user_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        user_info: 1,
        react_info: { $ifNull: ["$react_info", null] },
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
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  );

  const comments = await Comment.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total || 0,
    currPage: page,
    totalPage: Math.ceil(comments[0]?.totalCount[0]?.total / limit) || 1,
  });
};

// For not logged in users
const getPlaylistDetails = async (req, res) => {
  let userId;

  if (req.user) {
    userId = req.user.userId;
  }

  const { id } = req.params;

  const { videoLimit = 8, videoPage = 1 } = req.query;

  const limit = Number(videoLimit) || 12;
  const skip = (Number(videoPage) - 1) * limit;

  const foundedPlaylist = await Playlist.findOne({
    _id: id,
  });

  if (!foundedPlaylist) {
    throw new NotFoundError("Playlist not found");
  }

  switch (foundedPlaylist.type) {
    case "playlist":
      if (
        foundedPlaylist.privacy === "private" &&
        userId &&
        userId !== foundedPlaylist.created_user_id.toString()
      ) {
        throw new ForbiddenError(
          "You are not authorized to access this playlist 1 ",
        );
      }
      break;
    case "history":
      throw new ForbiddenError(
        "You are not authorized to access this playlist 2",
      );

    default:
      if (userId && userId !== foundedPlaylist.created_user_id.toString()) {
        throw new ForbiddenError(
          "You are not authorized to access this playlist 3",
        );
      }
  }

  const pipeline = [
    {
      $set: {
        _idStr: { $toString: "$_id" },
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
      $match: { _idStr: id },
    },
    {
      $lookup: {
        from: "users",
        localField: "created_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: "channel_info",
      },
    },
    {
      $unwind: "$channel_info",
    },
  ];

  if (videoLimit && videoLimit > 0) {
    pipeline.push(
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$objectIdVideoList" },
          pipeline: [
            {
              $set: {
                videoIdList: "$$videoIdList",
                order: {
                  $indexOfArray: ["$$videoIdList", "$_id"],
                },
              },
            },
            {
              $match: {
                $expr: { $in: ["$_id", "$videoIdList"] },
              },
            },
          ],
          as: "videos",
        },
      },
      {
        $set: {
          count: { $size: "$videos" },
        },
      },
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$objectIdVideoList" },
          pipeline: [
            {
              $set: {
                videoIdList: "$$videoIdList",
                order: {
                  $indexOfArray: ["$$videoIdList", "$_id"],
                },
              },
            },
            {
              $match: {
                $expr: { $in: ["$_id", "$videoIdList"] },
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
              $limit: limit,
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
                video: 1,
                stream: {
                  $cond: {
                    if: { $ne: ["$stream", null] }, // Check if `stream` exists and is not null
                    then: "$stream", // Keep the `stream` value if it exists
                    else: null, // Set it to null if it doesn't exist
                  },
                },
                createdAt: 1,
                duration: 1,
                channel_info: 1,
              },
            },
          ],
          as: "video_list",
        },
      },
    );
  }

  pipeline.push({
    $project: {
      _id: 1,
      channel_info: 1,
      title: 1,
      createdAt: 1,
      type: 1,
      video_list: { $ifNull: ["$video_list", []] },
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
    totalPages: Math.max(Math.ceil(playlist[0].size / Number(videoLimit)), 1),
  });
};

const getTagsList = async (req, res) => {
  const { limit, page, sort, search, priorityList } = req.query;

  const dataLimit = Number(limit) || 5;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        validator.isString("title", title);
        searchObj.title = searchWithRegex(title);
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

  let sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt"]);
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
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors, message: "Failed to get data from server" });
    }
  }

  if (Object.keys(sortObj).length < 1) {
    sortObj.createdAt = -1;
  }

  const pipeline = [{ $match: searchObj }];

  if (priorityList && priorityList.length > 0) {
    sortObj = { priority: -1, ...sortObj };

    pipeline.push(
      {
        $set: {
          _idStr: { $toString: "$_id" },
        },
      },
      {
        $set: {
          priority: { $cond: [{ $in: ["$_idStr", priorityList] }, 1, 0] },
        },
      },
    );
  }

  pipeline.push(
    {
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: dataLimit }],
      },
    },
  );

  const tags = await Tag.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: tags[0]?.data,
    qtt: tags[0]?.data?.length,
    totalQtt: tags[0]?.totalCount[0]?.total,
    currPage: dataPage,
    totalPages: Math.ceil(tags[0]?.totalCount[0]?.total / dataLimit),
  });
};

module.exports = {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShorts,
  getPlaylistDetails,
  getTagsList,
};
