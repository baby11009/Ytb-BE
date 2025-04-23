const { Video, Playlist, User, Comment, Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { v4: uuidv4 } = require("uuid");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const mongoose = require("mongoose");
const {
  encodedWithZlib,
  decodedWithZlib,
  mergeListsRandomly,
} = require("../../utils/other");

const {
  client,
  addValue,
  setKeyExpire,
  removeKey,
  getSetValue,
  getValue,
} = require("../../redis/instance/client");

const { generateSessionId } = require("../../utils/generator");

const getDataList = async (req, res) => {
  const {
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

  const limit = Number(req.query.limit) || 16;
  const page = Number(req.query.page) || 1;
  const skip = (page - 1) * limit;

  let playlistList = [];
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

  // Get playlist if type is not short , user don't provide tag and page < 3
  if (["all", "video"].includes(type) && !tag) {
    const addFieldsObj = { _idStr: { $toString: "$_id" } };

    const matchObj = {
      type: "playlist",
      _idStr: { $nin: watchedPlIdList },
      itemList: { $ne: [] },
    };

    if (search) {
      matchObj["title"] = { $regex: search, $options: "i" };
    }

    if (channelEmail) {
      matchObj["channel_info.email"] = channelEmail;
    } else {
      matchObj["privacy"] = "public";
    }

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
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
      {
        $set: {
          ...addFieldsObj,
        },
      },
      {
        $match: matchObj,
      },
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$itemList" },
          pipeline: [
            {
              $set: {
                order: {
                  $indexOfArray: ["$$videoIdList", { $toString: "$_id" }],
                },
              },
            },
            {
              $match: {
                $expr: { $in: [{ $toString: "$_id" }, "$$videoIdList"] },
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
    if (channelEmail) {
      playlistPipeline.push(
        {
          $sort: {
            updatedAt: -1,
          },
        },
        { $limit: 2 },
        { $skip: 2 * (page - 1) },
      );
    } else {
      playlistPipeline.push({ $sample: { size: 2 } });
    }

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

    playlistList = await Playlist.aggregate(playlistPipeline);
    console.log(5);
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
                  slug: value,
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
          $unwind: {
            path: "$tag_info",
            preserveNullAndEmptyArrays: true,
          },
        },
      );

      videoMatchObj["tag_info.slug"] = value;
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
      { $limit: limit - playlistList.length },
    );
  } else {
    videoPipeline.push({ $sample: { size: limit - playlistList.length } });
  }

  videoPipeline.push({
    $project: {
      _id: 1,
      title: 1,
      thumb: 1,
      video: 1,
      stream: 1,
      duration: { $ifNull: ["$duration", 0] },
      tag_info: 1,
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
        item["$sample"]["size"] = limit;
      }
    });

    shorts = await Video.aggregate(shortPipeline);
  }

  let finalData = [...videos];

  console.log("🚀 ~ playlistList.length:", playlistList.length);
  if (playlistList.length > 0) {
    finalData = mergeListsRandomly(finalData, playlistList);
    // for (let playlist of playlistList) {
    //   const position = Math.floor(Math.random() * finalData.length - 1);

    //   switch (position) {
    //     case position === 0:
    //       finalData = [playlist, ...finalData];
    //       break;
    //     case position === finalData.length - 1:
    //       finalData = [...finalData, playlist];
    //       break;
    //     default:
    //       finalData = [
    //         ...finalData.slice(0, position),
    //         playlist,
    //         ...finalData.slice(position, finalData.length),
    //       ];
    //   }
    // }
  }

  let result = {
    data: finalData,
    page: page,
  };

  if (shorts) {
    result.shorts = shorts;
  }

  res.status(StatusCodes.OK).json(result);
};

//  if data is still available then set next cursor
// format cursos for get random data
// true if there is available data
// false if there is no  data left
// {
//   video :true,
//   short :true,
//   playlist :true
// }
// format cursors for get sorted data
// previeous last data will be used to get next data
// {
//   video : {

//   },
//   short : {

//   },
//   playlist : {

//   }
// }
const getRandomData = async (req, res) => {
  const { sort, tag } = req.query;

  const limit = Number(req.query.limit) || 16;

  let remainQtt = limit;

  const userId = req?.user?.userId;

  let cursors;

  if (req.query.cursors) {
    try {
      cursors = decodedWithZlib(req.query.cursors);
    } catch (e) {
      throw new BadRequestError("Invalid cursor format");
    }
  }

  let sessionId = req.cookies.sessionId;

  if (!sessionId) {
    sessionId = userId || uuidv4();
    res.cookie("sessionId", sessionId, {
      // 1hour
      maxAge: 3600 * 1000,
      httpOnly: true,
      secure: true, // 👈 bắt buộc nếu dùng SameSite: 'None'
      sameSite: "None",
    });
  }

  // if previeous fetch is no same with current fetch then remove previous data
  const previousFetchType = await getValue(`session:${sessionId}-type`);
  const currentFetch = sort ? "sort" : "random";

  // remove previous data if current fetch is sort and previous fetch is random

  if (
    currentFetch === "sort" &&
    previousFetchType &&
    previousFetchType === "random"
  ) {
    await removeKey(`session:${sessionId}-video`);

    await removeKey(`session:${sessionId}-playlist`);
  }

  await addValue(`session:${sessionId}-type`, currentFetch);

  let video = [],
    short = [],
    playlist = [];

  // use chaining condition to perfectly get data
  // because field like createdAt, view, like,... can be similar between documents
  // if use strict condition like gte or lte then it will automatically exclude data field
  // that have same value in those field but difference in other fields
  const sortInfomations = {
    recently: () => {
      if (!cursors) return { sort: { createdAt: -1, _id: -1 } };

      return {
        match: {
          $or: [
            { createdAt: { $lt: new Date(cursors.video.createdAt) } },
            {
              createdAt: new Date(cursors.video.createdAt),
              _id: { $lt: new mongoose.Types.ObjectId(cursors.video._id) },
            },
          ],
        },
        sort: { createdAt: -1, _id: -1 },
      };
    },
    oldest: () => {
      if (!cursors) return { sort: { createdAt: 1, _id: 1 } };

      return {
        match: {
          $or: [
            { createdAt: { $gt: new Date(cursors.video.createdAt) } },
            {
              createdAt: new Date(cursors.video.createdAt),
              _id: { $gt: new mongoose.Types.ObjectId(cursors.video._id) },
            },
          ],
        },
        sort: { createdAt: 1, _id: 1 },
      };
    },

    popular: () => {
      if (!cursors)
        return { sort: { view: -1, like: -1, dislike: -1, _id: -1 } };

      return {
        match: {
          $or: [
            { view: { $gt: cursors.video.view } },
            {
              view: cursors.video.createdAt,
              like: { $gt: cursors.video.like },
            },
            {
              view: cursors.video.createdAt,
              like: cursors.video.like,
              dislike: { $gt: cursors.video.dislike },
            },
            {
              view: cursors.video.createdAt,
              like: cursors.video.like,
              dislike: cursors.video.dislike,
              _id: { $gt: new mongoose.Types.ObjectId(cursors.video._id) },
            },
          ],
        },
        sort: { view: -1, like: -1, dislike: -1, _id: -1 },
      };
    },
  };

  const getVideoBaseOnType = async (type, limit) => {
    let matchObj = {
      type: type,
    };

    let sortObj = {};

    const pipeline = [];

    // Get random data
    let limitSet = { $sample: { size: limit } };

    const sortInfomation = sortInfomations[sort]
      ? sortInfomations[sort]()
      : undefined;

    if (sortInfomation) {
      sortObj = { ...sortObj, ...sortInfomation.sort };
      // Get limit data
      limitSet = { $limit: limit };
      if (cursors) {
        matchObj = { ...matchObj, ...sortInfomation.match };
      }
    } else {
      if (cursors) {
        const idList = await getSetValue(`session:${sessionId}-${type}`);

        if (idList.length > 0) {
          pipeline.push({ $set: { _idStr: { $toString: "$_id" } } });
          matchObj["_idStr"] = { $nin: idList };
        }
      }
    }

    // if (cursors) {
    //   const sortInfomation = sortInfomations[sort]
    //     ? sortInfomations[sort]()
    //     : undefined;
    //   if (sort && sortInfomation) {
    //     matchObj = { ...matchObj, ...sortInfomation.match };
    //     sortObj = { ...sortObj, ...sortInfomation.sort };
    //     // Get limit data
    //     limitSet = { $limit: limit };
    //   } else {
    //     const idList = await getSetValue(`session:${sessionId}-${type}`);

    //     if (idList.length > 0) {
    //       pipeline.push({ $set: { _idStr: { $toString: "$_id" } } });
    //       matchObj["_idStr"] = { $nin: idList };
    //     }
    //   }
    // } else if (sort) {
    // }

    if (tag) {
      pipeline.push(
        {
          $lookup: {
            from: "tags",
            let: {
              tagList: "$tags",
            },
            pipeline: [
              {
                $set: {
                  _idStr: { $toString: "$_id" },
                },
              },
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$_idStr", "$$tagList"] },
                      { $eq: ["$title", tag] },
                    ],
                  },
                },
              },
              {
                $project: {
                  title: 1,
                  slug: 1,
                },
              },
            ],
            as: "tag_info",
          },
        },
        { $unwind: "$tag_info" },
      );

      matchObj["tag_info.title"] = tag;
    }

    if (Object.keys(matchObj).length > 0) {
      pipeline.push({ $match: matchObj });
    }

    if (Object.keys(sortObj).length > 0) {
      pipeline.push({ $sort: sortObj });
    }

    pipeline.push({
      $facet: {
        total: [{ $count: "size" }],
        data: [
          limitSet,
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
          {
            $project: {
              title: 1,
              thumb: 1,
              duration: { $ifNull: ["$duration", 0] },
              tag_info: 1,
              type: 1,
              channel_info: 1,
              view: 1,
              like: 1,
              dislike: 1,
              createdAt: 1,
            },
          },
        ],
      },
    });

    return await Video.aggregate(pipeline);
  };

  const nextCursors = {
    playlist: null,
    video: null,
    short: null,
  };

  const getRandomRules = {
    video: {
      // fetching video data if request didn't provide cursors or cursors for video data is available
      // it's mean video still have data left to return
      condition: !cursors || cursors?.video,
      action: async () => {
        const videoLimit =
          !cursors || cursors?.playlist
            ? Math.floor((remainQtt * 4) / 5)
            : remainQtt;
        video = await getVideoBaseOnType("video", videoLimit);

        if (video.length && video[0].data.length) {
          remainQtt = remainQtt - video[0].data.length;

          // set next video cursors
          if (sort) {
            if (video[0].total[0].size > video[0].data.length) {
              const lastVideo = video[0].data[video[0].data.length - 1];

              nextCursors.video = {
                _id: lastVideo._id,
                createdAt: lastVideo.createdAt,
                view: lastVideo.view,
                like: lastVideo.like,
                dislike: lastVideo.dislike,
              };
            }
          } else {
            await addValue(
              `session:${sessionId}-video`,
              video[0].data.map((data) => data._id.toString()),
            );

            nextCursors.video =
              Math.max(video[0].total[0].size - videoLimit, 0) || null;
          }
        }
      },
    },
    short: {
      condition: !cursors || cursors?.short,
      action: async () => {
        const shortLimit = 12;

        short = await getVideoBaseOnType("short", shortLimit);

        if (short.length && short[0].data.length) {
          // set next short cursors
          if (sort) {
            if (short[0].total[0].size > short[0].data.length) {
              const lastShort = short[0].data[short[0].data.length - 1];

              nextCursors.short = {
                _id: lastShort._id,
                createdAt: lastShort.createdAt,
                view: lastShort.view,
                like: lastShort.like,
                dislike: lastShort.dislike,
              };
            }
          } else {
            await addValue(
              `session:${sessionId}-short`,
              short[0].data.map((data) => data._id.toString()),
            );

            nextCursors.short =
              Math.max(short[0].total[0].size - shortLimit, 0) || null;
          }
        }
      },
    },
    playlist: {
      condition: !tag && !sort && (!cursors || cursors?.playlist),
      action: async () => {
        const playlistLimit = remainQtt;
        const playlistPipeline = [];

        const matchObj = {
          type: "playlist",
          itemList: { $ne: [] },
        };

        if (cursors) {
          const playlistIdList = await client.sMembers(
            `session:${sessionId}-playlist`,
          );

          playlistPipeline.push({
            $set: {
              _idStr: { $toString: "$_id" },
            },
          });

          matchObj["_idStr"] = { $nin: playlistIdList };
        }

        playlistPipeline.push(
          { $match: matchObj },
          {
            $facet: {
              total: [{ $count: "size" }],
              data: [
                { $limit: playlistLimit },
                {
                  $lookup: {
                    from: "users",
                    localField: "created_user_id",
                    foreignField: "_id",
                    pipeline: [
                      {
                        $project: {
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
                {
                  $lookup: {
                    from: "videos",
                    let: { videoIdList: "$itemList" },
                    pipeline: [
                      {
                        $set: {
                          _idStr: { $toString: "$_id" },
                          order: {
                            $indexOfArray: [
                              "$$videoIdList",
                              { $toString: "$_id" },
                            ],
                          },
                        },
                      },
                      {
                        $match: {
                          $expr: {
                            $in: [{ $toString: "$_id" }, "$$videoIdList"],
                          },
                        },
                      },
                      {
                        $sort: {
                          order: -1,
                        },
                      },
                      {
                        $limit: 1,
                      },
                      {
                        $project: {
                          _id: 1,
                          title: 1,
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
                    title: 1,
                    video_list: 1,
                    channel_info: 1,
                    relevanceScore: 1,
                    size: { $size: "$itemList" },
                    createdAt: 1,
                    updatedAt: 1,
                  },
                },
              ],
            },
          },
        );

        playlist = await Playlist.aggregate(playlistPipeline);

        // set next playlist cursors
        if (playlist.length && playlist[0].data.length) {
          await addValue(
            `session:${sessionId}-playlist`,
            playlist[0].data.map((data) => data._id.toString()),
          );
          nextCursors.playlist =
            Math.max(playlist[0].total[0].size - playlistLimit, 0) || null;
        }
      },
    },
  };

  for (const [, method] of Object.entries(getRandomRules)) {
    if (method.condition) {
      await method.action();
    }
  }

  let newCursors;
  if (nextCursors.video || nextCursors.short || nextCursors.playlist) {
    newCursors = encodedWithZlib(nextCursors);
  } else newCursors = null;

  const comebineData = mergeListsRandomly(
    video.length ? video[0]?.data : [],
    playlist.length ? playlist[0]?.data : [],
  );

  res.status(200).json({
    video: comebineData,
    short: short[0]?.data || [],
    cursors: newCursors,
  });
};

const getVideoList = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const listLimit = Number(limit) || 8;

  const listPage = Number(page) || 1;

  const skip = (listPage - 1) * listLimit;

  const setFieldsObj = {};

  const matchObj = {};

  const pipeline = [
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

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const queryFuncObj = {
      channelEmail: (value) => {
        setFieldsObj["email"] = "$channel_info.email";
        matchObj["email"] = value;
      },
      search: (value) => {
        matchObj["title"] = { $regex: value, $options: "i" };
      },
      type: (value) => {
        matchObj["type"] = value;
      },
      tag: (value) => {
        pipeline.push({
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
        });

        matchObj["$expr"] = {
          $and: [
            {
              $gt: [{ $size: "$tag_info" }, 0],
            },
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$tag_info",
                      as: "t",
                      cond: { $eq: ["$$t.slug", value] },
                    },
                  },
                },
                0,
              ],
            },
          ],
        };
      },
    };

    for (const [key, value] of searchEntries) {
      if (queryFuncObj[key] && value) {
        queryFuncObj[key](value);
      }
    }

    if (Object.keys(setFieldsObj).length > 0) {
      pipeline.push({
        $set: setFieldsObj,
      });
    }

    if (Object.keys(matchObj).length > 0) {
      pipeline.push({
        $match: matchObj,
      });
    }
  }

  const sortEntries = Object.entries(sort || {});

  const sortObj = {};

  if (sortEntries.length > 0) {
    const validSortKey = ["createdAt", "view"];

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
  }

  // $sort sẽ dựa theo thứ tự điều kiện sort trong object
  if (Object.keys(sortObj).length < 1) {
    sortObj["createdAt"] = -1;
  }

  pipeline.push({
    $sort: sortObj,
  });

  pipeline.push({
    $project: {
      _id: 1,
      title: 1,
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

const getSearchingDatas = async (req, res) => {
  const { search, tag } = req.query;

  if (!search) {
    res.status(StatusCodes.NO_CONTENT).json({ content: [], cursors: null });
  }

  // extract user request id to lookup for user request subscription for matched users
  const userId = req?.user?.userId;

  const validType = ["all", "user", "playlist", "video", "short"];

  let type = validType.includes(req.query.type) ? req.query.type : "all";

  let cursors;

  if (req.query.cursors) {
    try {
      cursors = decodedWithZlib(req.query.cursors);
    } catch (e) {
      throw new BadRequestError("Invalid cursor format");
    }
  }

  const limit = Number(req.query.limit) || 12;

  let remainQtt = limit;

  let user = [];

  let playlist = [];

  let video = [];

  let nextCursors = {
    playlist: null,
    video: null,
    user: null,
  };

  const searchingRules = {
    user: {
      condition: ["all", "user"].includes(type) && !tag,
      action: async () => {
        if (cursors && !cursors.user) {
          return null;
        }

        let userLimit = 2;

        // if user search for user only
        if (type !== "all") {
          userLimit = remainQtt;
        }

        const pipeline = [
          { $match: { name: { $regex: search, $options: "i" } } },
          {
            $set: {
              // search string appear position in name
              position: {
                $indexOfCP: [{ $toLower: "$name" }, search.toLowerCase()],
              },
              // name length
              nameLength: { $strLenCP: "$name" },
              // if name is 100% match the search string
              exactMatch: {
                $eq: [{ $toLower: "$name" }, search.toLowerCase()],
              },
              // if name is start with search string
              startsWith: {
                $eq: [
                  {
                    $indexOfCP: [{ $toLower: "$name" }, search.toLowerCase()],
                  },
                  0,
                ],
              },
            },
          },
          {
            $set: {
              // calculate relevanceScore
              relevanceScore: {
                $add: [
                  // if exactMatch = true  + 150
                  { $cond: ["$exactMatch", 150, 0] },

                  // if name is start with search string + 100
                  { $cond: ["$startsWith", 100, 0] },

                  // additional point base on position of search string in name
                  // if position more higher than will get more additional point
                  {
                    $subtract: [
                      80,
                      {
                        $multiply: [
                          { $divide: ["$position", "$nameLength"] },
                          60,
                        ],
                      },
                    ],
                  },

                  // Add 50 if after the searching string position is empty space or position = 0
                  {
                    $cond: [
                      {
                        $or: [
                          // Uf position = 0 + 50
                          { $eq: ["$position", 0] },
                          // If position != 0 then get 1 letter before search string position
                          // if letter = empty space + 50
                          {
                            $eq: [
                              {
                                $substrCP: [
                                  "$name",
                                  { $subtract: ["$position", 1] },
                                  1,
                                ],
                              },
                              " ",
                            ],
                          },
                        ],
                      },
                      50, // Điểm cộng thêm nếu là từ độc lập
                      0, // Không cộng nếu là một phần của từ khác
                    ],
                  },
                ],
              },
            },
          },
        ];

        if (cursors) {
          // Chainning conditions to get the next data
          // if use strict condition like
          // {
          //   relevanceScore: { $lte: cursors.video.relavanceScore },
          //   subscriber: { $lte: cursors.user.subscriber },
          //   view: { $lte: cursors.user.view },
          //   createdAt: { $gte: new Date(cursors.video.createdAt) },
          //   _id: { $gt: new mongoose.Types.ObjectId(cursors.video._id) },
          // }
          // it will only get the data that match all the conditions
          // but there will some of them match several conditions
          // so we need to use $or to get the data that match any of the conditions
          pipeline.push({
            $match: {
              $or: [
                { relevanceScore: { $lt: cursors.user.relavanceScore } },
                {
                  relevanceScore: cursors.user.relavanceScore,
                  subscriber: { $lt: cursors.user.subscriber },
                },
                {
                  relevanceScore: cursors.user.relavanceScore,
                  subscriber: cursors.user.subscriber,
                  view: { $lt: cursors.user.view },
                },
                {
                  relevanceScore: cursors.user.relavanceScore,
                  subscriber: cursors.user.subscriber,
                  view: cursors.user.view,
                  createdAt: { $gt: new Date(cursors.user.createdAt) },
                },
                {
                  relevanceScore: cursors.user.relavanceScore,
                  subscriber: cursors.user.subscriber,
                  view: cursors.user.view,
                  createdAt: new Date(cursors.user.createdAt),
                  _id: { $gt: new mongoose.Types.ObjectId(cursors.user._id) },
                },
              ],
            },
          });
        }

        pipeline.push({
          $sort: {
            // most relevance match score
            relevanceScore: -1,
            // most subscriber
            subscriber: -1,
            // most view
            view: -1,
            // most longest created time
            createdAt: 1,
            // If 2 data have same timestamp than compare their ObjectId
            _id: 1,
          },
        });

        const facet = {
          $facet: {
            total: [{ $count: "size" }],
            data: [{ $limit: userLimit }],
          },
        };

        if (userId) {
          facet.$facet.data.push(
            {
              $lookup: {
                from: "subscribes",
                localField: "_id",
                foreignField: "channel_id",
                pipeline: [{ $match: { subscriber_id: userId } }],
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

        facet.$facet.data.push({
          $project: {
            name: 1,
            email: 1,
            avatar: 1,
            subscription_info: 1,
            subscriber: 1,
            view: 1,
            relevanceScore: 1,
            createdAt: 1,
          },
        });

        pipeline.push(facet);

        user = await User.aggregate(pipeline);

        // if type == user (client only request for user data)
        // and remain data is larger than current fetched data then set next cursor
        if (
          type === "user" &&
          user.length > 0 &&
          user[0].total[0]?.size > user[0].data.length
        ) {
          const lastData = user[0].data[user[0].data.length - 1];

          nextCursors.user = {
            relavanceScore: lastData.relevanceScore,
            subscriber: lastData.subscriber,
            view: lastData.view,
            createdAt: lastData.createdAt,
            _id: lastData._id,
          };
        }

        remainQtt = remainQtt - user[0].data.length;
      },
    },
    playlist: {
      condition: ["all", "playlist"].includes(type) && !tag,
      action: async () => {
        if (cursors && !cursors.playlist) {
          return null;
        }

        // playlist limit will equal 1/4 remainQtt and floor to round down if value not int
        let playlistLimit = Math.round(remainQtt / 4);

        // if user search for playlist only or data cursor of video is not available (means there is no video data left)
        // then playlist limit will equal remainQtt
        if (type === "playlist" || (cursors && !cursors.video)) {
          playlistLimit = remainQtt;
        }

        const pipeline = [
          {
            $match: {
              title: { $regex: search, $options: "i" },
              type: "playlist",
              privacy: "public",
            },
          },
          {
            $set: {
              // search string appear position in title
              position: {
                $indexOfCP: [{ $toLower: "$title" }, search.toLowerCase()],
              },
              // title length
              titleLength: { $strLenCP: "$title" },
              // if title is 100% match the search string
              exactMatch: {
                $eq: [{ $toLower: "$title" }, search.toLowerCase()],
              },
              // if title is start with search string
              startsWith: {
                $eq: [
                  {
                    $indexOfCP: [{ $toLower: "$title" }, search.toLowerCase()],
                  },
                  0,
                ],
              },
            },
          },
          {
            $set: {
              // calculate relevanceScore
              relevanceScore: {
                $add: [
                  // if exactMatch = true  + 150
                  { $cond: ["$exactMatch", 150, 0] },

                  // if title is start with search string + 100
                  { $cond: ["$startsWith", 100, 0] },

                  // additional point base on position of search string in title
                  // if position more higher than will get more additional point
                  {
                    $subtract: [
                      80,
                      {
                        $multiply: [
                          { $divide: ["$position", "$titleLength"] },
                          60,
                        ],
                      },
                    ],
                  },
                  // Add 50 if after the searching string position is empty space or position = 0
                  {
                    $cond: [
                      {
                        $or: [
                          // Uf position = 0 + 50
                          { $eq: ["$position", 0] },
                          // If position != 0 then get 1 letter before search string position
                          // if letter = empty space + 50
                          {
                            $eq: [
                              {
                                $substrCP: [
                                  "$title",
                                  { $subtract: ["$position", 1] },
                                  1,
                                ],
                              },
                              " ",
                            ],
                          },
                        ],
                      },
                      50, // Điểm cộng thêm nếu là từ độc lập
                      0, // Không cộng nếu là một phần của từ khác
                    ],
                  },
                ],
              },
            },
          },
        ];

        if (cursors) {
          // Chainning conditions to get the next data
          // if use strict condition like
          // {
          //  relevanceScore: { $lte: cursors.playlist.relavanceScore },
          //  createdAt: { $lte: new Date(cursors.playlist.createdAt) },
          //  _id: { $lt: new mongoose.Types.ObjectId(cursors.playlist._id) },
          // }
          // it will only get the data that match all the conditions
          // but there will some of them match several conditions
          // so we need to use $or to get the data that match any of the conditions
          pipeline.push({
            $match: {
              $or: [
                { relevanceScore: { $lt: cursors.playlist.relavanceScore } },
                {
                  relevanceScore: cursors.playlist.relavanceScore,
                  createdAt: { $lt: new Date(cursors.playlist.createdAt) },
                },
                {
                  relevanceScore: cursors.playlist.relavanceScore,
                  createdAt: new Date(cursors.playlist.createdAt),
                  _id: {
                    $lt: new mongoose.Types.ObjectId(cursors.playlist._id),
                  },
                },
              ],
            },
          });
        }

        pipeline.push(
          {
            $sort: {
              // most relevance match score
              relevanceScore: -1,
              // newly created
              createdAt: -1,
              // If 2 data have same timestamp than compare their ObjectId
              _id: -1,
            },
          },
          {
            $facet: {
              total: [{ $count: "size" }],
              data: [
                { $limit: playlistLimit },
                {
                  $lookup: {
                    from: "users",
                    localField: "created_user_id",
                    foreignField: "_id",
                    pipeline: [
                      {
                        $project: {
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
                {
                  $lookup: {
                    from: "videos",
                    let: { videoIdList: "$itemList" },
                    pipeline: [
                      {
                        $set: {
                          _idStr: { $toString: "$_id" },
                          order: {
                            $indexOfArray: [
                              "$$videoIdList",
                              { $toString: "$_id" },
                            ],
                          },
                        },
                      },
                      {
                        $match: {
                          $expr: {
                            $in: [{ $toString: "$_id" }, "$$videoIdList"],
                          },
                        },
                      },
                      {
                        $sort: {
                          order: -1,
                        },
                      },
                      {
                        $limit: 1,
                      },
                      {
                        $project: {
                          _id: 1,
                          title: 1,
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
                    title: 1,
                    video_list: 1,
                    channel_info: 1,
                    relevanceScore: 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
        );

        playlist = await Playlist.aggregate(pipeline);

        // if remain data is larger than current fetched data then set next cursor
        if (
          playlist.length > 0 &&
          playlist[0].total[0]?.size > playlist[0].data.length
        ) {
          const lastData = playlist[0].data[playlist[0].data.length - 1];
          nextCursors.playlist = {
            relavanceScore: lastData.relevanceScore,
            createdAt: lastData.createdAt,
            _id: lastData._id,
          };
        }

        remainQtt = remainQtt - playlist[0].data.length;
      },
    },
    video: {
      condition: ["all", "video", "short"].includes(type) || tag,
      action: async () => {
        if (cursors && !cursors.video) {
          return null;
        }

        const videoLimit = remainQtt;

        const pipeline = [];

        const matchObj = { title: { $regex: search, $options: "i" } };

        // match type if type is not all
        if (type !== "all") {
          matchObj.type = type;
        }

        if (tag) {
          pipeline.push(
            {
              $lookup: {
                from: "tags",
                let: {
                  tagList: "$tags",
                },
                pipeline: [
                  {
                    $set: {
                      _idStr: { $toString: "$_id" },
                    },
                  },
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ["$_idStr", "$$tagList"] },
                          { $eq: ["$title", tag] },
                        ],
                      },
                    },
                  },
                ],
                as: "tag_info",
              },
            },
            { $unwind: "$tag_info" },
          );

          matchObj["tag_info.title"] = tag;
        }

        pipeline.push(
          { $match: matchObj },
          {
            $set: {
              // search string appear position in title
              position: {
                $indexOfCP: [{ $toLower: "$title" }, search.toLowerCase()],
              },
              // title length
              titleLength: { $strLenCP: "$title" },
              // if title is 100% match the search string
              exactMatch: {
                $eq: [{ $toLower: "$title" }, search.toLowerCase()],
              },
              // if title is start with search string
              startsWith: {
                $eq: [
                  {
                    $indexOfCP: [{ $toLower: "$title" }, search.toLowerCase()],
                  },
                  0,
                ],
              },
            },
          },
          {
            $set: {
              // calculate relevanceScore
              relevanceScore: {
                $add: [
                  // if exactMatch = true  + 150
                  { $cond: ["$exactMatch", 150, 0] },

                  // if title is start with search string + 100
                  { $cond: ["$startsWith", 100, 0] },

                  // additional point base on position of search string in title
                  // if position more higher than will get more additional point
                  {
                    $subtract: [
                      80,
                      {
                        $multiply: [
                          { $divide: ["$position", "$titleLength"] },
                          60,
                        ],
                      },
                    ],
                  },
                  // Add 50 if after the searching string position is empty space or position = 0
                  {
                    $cond: [
                      {
                        $or: [
                          // Uf position = 0 + 50
                          { $eq: ["$position", 0] },
                          // If position != 0 then get 1 letter before search string position
                          // if letter = empty space + 50
                          {
                            $eq: [
                              {
                                $substrCP: [
                                  "$title",
                                  { $subtract: ["$position", 1] },
                                  1,
                                ],
                              },
                              " ",
                            ],
                          },
                        ],
                      },
                      50, // Điểm cộng thêm nếu là từ độc lập
                      0, // Không cộng nếu là một phần của từ khác
                    ],
                  },
                ],
              },
            },
          },
        );

        if (cursors) {
          // Chainning conditions to get the next data
          // if use strict condition like
          // {
          //   relevanceScore: { $lte: cursors.video.relavanceScore },
          //   view: { $lte: cursors.video.view },
          //   createdAt: { $lt3: new Date(cursors.video.createdAt) },
          //   _id: { $lt: new mongoose.Types.ObjectId(cursors.video._id) },
          // }
          // it will only get the data that match all the conditions
          // but there will some of them match several conditions
          // so we need to use $or to get the data that match any of the conditions
          pipeline.push({
            $match: {
              $or: [
                {
                  relevanceScore: { $lt: cursors.video.relavanceScore },
                },
                {
                  relevanceScore: cursors.video.relavanceScore,
                  view: { $lt: cursors.video.view },
                },
                {
                  relevanceScore: cursors.video.relavanceScore,
                  view: cursors.video.view,
                  createdAt: { $lt: new Date(cursors.video.createdAt) },
                },
                {
                  relevanceScore: cursors.video.relavanceScore,
                  view: cursors.video.view,
                  createdAt: new Date(cursors.video.createdAt),
                  _id: { $lt: new mongoose.Types.ObjectId(cursors.video._id) },
                },
              ],
            },
          });
        }

        pipeline.push(
          {
            $sort: {
              // most relevance match score
              relevanceScore: -1,
              // most view
              view: -1,
              // newly created
              createdAt: -1,
              // if 2 data have same timestamp than compare their ObjectId
              _id: -1,
            },
          },
          {
            $facet: {
              total: [{ $count: "size" }],
              data: [
                { $limit: videoLimit },
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
                {
                  $project: {
                    title: 1,
                    thumb: 1,
                    type: 1,
                    duration: 1,
                    description: 1,
                    channel_info: 1,
                    createdAt: 1,
                    view: 1,
                    relevanceScore: 1,
                  },
                },
              ],
            },
          },
        );

        video = await Video.aggregate(pipeline);

        // if remain data is larger than current fetched data then set next cursor
        if (
          video.length > 0 &&
          video[0].total[0]?.size > video[0].data.length
        ) {
          const lastData = video[0].data[video[0].data.length - 1];
          nextCursors.video = {
            relavanceScore: lastData.relevanceScore,
            createdAt: lastData.createdAt,
            view: lastData.view,
            _id: lastData._id,
          };
        }
      },
    },
  };

  for (const rule of Object.values(searchingRules)) {
    if (rule.condition) {
      await rule.action();
    }
  }

  if (nextCursors.user || nextCursors.playlist || nextCursors.video) {
    nextCursors = encodedWithZlib(nextCursors);
  } else nextCursors = null;

  let data = mergeListsRandomly(
    video.length > 0 ? video[0].data : [],
    playlist.length > 0 ? playlist[0].data : [],
  );

  if (user.length > 0) {
    data = [...user[0].data, ...data];
  }

  res.status(StatusCodes.OK).json({ data, cursors: nextCursors });
};

const getRandomShorts = async (req, res) => {
  const id = req.params?.id;

  let foundedShort;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    foundedShort = await Video.findOne({ type: "short", _id: id });
  }

  const size = Number(req.query?.size) || 2;

  const userId = req?.user?.userId;

  let sessionId = req.cookies.sessionId;

  let cursors;

  //  If there is no sessionId, it means this is the first time this request is being called.
  // So don't have to try to access cursors for next data
  if (!sessionId) {
    sessionId = userId || uuidv4();
    res.cookie("sessionId", sessionId, {
      // 1hour
      maxAge: 3600 * 1000,
      httpOnly: true,
      secure: true, // 👈 bắt buộc nếu dùng SameSite: 'None'
      sameSite: "None",
    });
  } else if (req.query.cursors) {
    try {
      cursors = decodedWithZlib(req.query.cursors);
    } catch (e) {
      throw new BadRequestError("Invalid cursors format");
    }
  }

  const setFieldsObj = { _idStr: { $toString: "$_id" } };

  const matchObj = {
    type: "short",
  };

  const facet = {
    total: [{ $count: "size" }],
  };

  let remainQtt = size;
  const watchedShortIdList = await getSetValue(`session:${sessionId}-short`);
  if (!cursors && id && foundedShort && !watchedShortIdList.includes(id)) {
    remainQtt = remainQtt - 1;
    const shortMatchIdFacet = [
      { $match: { _idStr: id } },
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
    // Get subscription and react info of the request owner if the request has been authenticated.

    if (userId) {
      shortMatchIdFacet.push(
        {
          $lookup: {
            from: "subscribes",
            let: {
              videoOwnerId: "$user_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$channel_id", "$$videoOwnerId"] },
                      { $eq: ["$subscriber_id", userId] },
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
        {
          $lookup: {
            from: "reacts",
            let: {
              videoId: "$_id",
            },
            // pipeline để so sánh dữ liệu
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$video_id", "$$videoId"] },
                      { $eq: ["$user_id", userId] },
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

    shortMatchIdFacet.push(
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
          channel_info: 1,
          subscription_info: 1,
          react_info: 1,
          tag_info: 1,
        },
      },
    );

    facet["shortMatchId"] = shortMatchIdFacet;
  } else if (cursors) {
    matchObj["_idStr"] = { $nin: watchedShortIdList };
  }

  const shortsFacet = [
    { $sample: { size: remainQtt } },
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

  // Get subscription and react info of the request owner if the request has been authenticated.
  if (userId) {
    shortsFacet.push(
      {
        $lookup: {
          from: "subscribes",
          let: {
            videoOwnerId: "$user_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$channel_id", "$$videoOwnerId"] },
                    { $eq: ["$subscriber_id", userId] },
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
      {
        $lookup: {
          from: "reacts",
          let: {
            videoId: "$_id",
          },
          // pipeline để so sánh dữ liệu
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$video_id", "$$videoId"] },
                    { $eq: ["$user_id", userId] },
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

  shortsFacet.push(
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
        channel_info: 1,
        subscription_info: 1,
        react_info: 1,
        tag_info: 1,
      },
    },
  );

  facet["shorts"] = shortsFacet;

  const pipeline = [
    { $set: setFieldsObj },
    { $match: matchObj },
    { $facet: facet },
  ];

  const shorts = await Video.aggregate(pipeline);
  let shortList = [];
  let nextCursors = null;

  if (shorts.length) {
    let fetchedDataCount;
    if (shorts[0]?.shortMatchId) {
      fetchedDataCount = 1 + shorts[0]?.shorts.length;
      shortList = [...shorts[0]?.shortMatchId];
    } else {
      fetchedDataCount = shorts[0]?.shorts.length;
    }

    shortList = [...shortList, ...shorts[0]?.shorts];

    nextCursors =
      Math.max(shorts[0].total[0]?.size - fetchedDataCount, 0) || null;
  }

  if (shortList.length) {
    const shortIdList = shortList.map((short) => short._id.toString());
    await addValue(`session:${sessionId}-short`, shortIdList);
  }

  const newCursors = nextCursors ? encodedWithZlib(nextCursors) : nextCursors;

  res
    .status(StatusCodes.OK)
    .json({ data: shortList, cursors: newCursors, nextCursors });
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
            subscriberId: userId,
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

const getChannelData = async (req, res) => {
  const authEmail = req?.user?.email;

  const { email } = req.params;
  const { title = "" } = req.query;

  const limit = Number(req.query.limit) || 12;

  let videoLimit = Math.round((limit * 3) / 4);

  let cursors;

  if (req.query.cursors) {
    try {
      cursors = JSON.parse(Buffer.from(req.query.cursors, "base64").toString());
    } catch (e) {
      throw new BadRequestError("Invalid cursor format");
    }
  }

  const videoMatchObj = {
    "channel_info.email": email,
    title: { $regex: title, $options: "i" },
  };

  const playlistMatchObj = {
    title: { $regex: title, $options: "i" },
    "channel_info.email": email,
    type: "playlist",
    privacy: "public",
    $expr: {
      $gt: [{ $size: "$itemList" }, 0],
    },
  };

  if (authEmail === email) {
    delete playlistMatchObj.privacy;
  }

  if (cursors) {
    if (cursors.video && !cursors.playlist) {
      videoLimit = limit;
    } else if (cursors.playlist && !cursors.video) {
      videoLimit = 0;
    }

    if (cursors.video) {
      videoMatchObj["createdAt"] = { $lt: new Date(cursors.video.createdAt) };
      videoMatchObj["view"] = { $lte: cursors.video.view };
    }

    if (cursors.playlist) {
      playlistMatchObj["updatedAt"] = { $lt: new Date(cursors.playlist) };
    }
  }

  let videoList = [];

  if (!cursors || cursors?.video) {
    const videoPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          pipeline: [
            { $project: { name: 1, email: 1, avatar: 1, subscriber: 1 } },
          ],
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
      {
        $match: videoMatchObj,
      },
      {
        $sort: {
          createdAt: -1,
          view: -1,
        },
      },
      {
        $project: {
          title: 1,
          thumb: 1,
          description: 1,
          channel_info: 1,
          type: 1,
          view: 1,
          createdAt: 1,
        },
      },
      {
        $facet: {
          total: [{ $count: "size" }],
          data: [{ $limit: videoLimit }],
        },
      },
    ];

    videoList = await Video.aggregate(videoPipeline);
  }

  if (videoList[0].data.length < videoLimit) {
    videoLimit = videoList[0].data.length;
  }

  let playlistList = [];

  if (!cursors || cursors?.playlist) {
    const playlistPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "created_user_id",
          foreignField: "_id",
          pipeline: [
            { $project: { name: 1, email: 1, avatar: 1, subscriber: 1 } },
          ],
          as: "channel_info",
        },
      },
      {
        $unwind: "$channel_info",
      },
      {
        $match: playlistMatchObj,
      },
      {
        $sort: {
          updatedAt: -1,
        },
      },
      {
        $lookup: {
          from: "videos",
          let: { videoIdList: "$itemList" },
          pipeline: [
            {
              $set: {
                order: {
                  $indexOfArray: ["$$videoIdList", { $toString: "$_id" }],
                },
              },
            },
            {
              $match: {
                $expr: { $in: [{ $toString: "$_id" }, "$$videoIdList"] },
              },
            },
            {
              $sort: {
                order: -1,
              },
            },
            {
              $limit: 2,
            },
            {
              $project: {
                _id: 1,
                thumb: 1,
                title: 1,
                duration: 1,
              },
            },
          ],
          as: "video_list",
        },
      },
      {
        $project: {
          title: 1,
          channel_info: 1,
          video_list: 1,
          updatedAt: 1,
        },
      },
      {
        $facet: {
          total: [{ $count: "size" }],
          data: [
            {
              $limit: limit - videoLimit,
            },
          ],
        },
      },
    ];

    playlistList = await Playlist.aggregate(playlistPipeline);
  }

  const newCursors = {};

  if (videoList[0].total[0]?.size > videoList[0].data.length) {
    const finalData = videoList[0].data[videoList[0].data.length - 1];
    newCursors.video = {
      createdAt: finalData.createdAt,
      view: finalData.view,
    };
  }

  if (playlistList[0].total[0]?.size > playlistList[0].data.length) {
    newCursors.playlist =
      playlistList[0].data[playlistList[0].data.length - 1].updatedAt;
  }

  const combinedList = mergeListsRandomly(
    videoList[0].data,
    playlistList[0].data,
  );

  const nextCursor =
    Object.keys(newCursors).length > 0
      ? Buffer.from(JSON.stringify(newCursors)).toString("base64")
      : null;

  res.status(200).json({ data: combinedList, cursors: nextCursor });
};

const getChannelPlaylistVideos = async (req, res) => {
  const { channelEmail, videoLimit = 12, sort = { createdAt: -1 } } = req.query;

  if (!channelEmail) {
    throw new BadRequestError("Please provide a channel email");
  }

  const limit = Number(req.query.limit) || 3;
  const page = Number(req.query.page) || 1;

  const skip = (page - 1) * page;

  const foundedChannel = await User.findOne({ email: channelEmail });

  if (!foundedChannel) {
    throw new NotFoundError("Channel not found");
  }

  const userId = req?.user?.userId;

  const matchObj = {
    created_user_id: foundedChannel._id,
    type: "playlist",
    privacy: "public",
  };

  if (userId) {
    delete matchObj.privacy;
  }

  const pipeline = [
    {
      $match: matchObj,
    },
    {
      $lookup: {
        from: "videos",
        let: { videoIdList: "$itemList" },
        pipeline: [
          {
            $set: {
              _idStr: { $toString: "$_id" },
              order: {
                $indexOfArray: ["$$videoIdList", { $toString: "$_id" }],
              },
            },
          },
          {
            $match: {
              $expr: { $in: [{ $toString: "$_id" }, "$$videoIdList"] },
            },
          },
          {
            $sort: {
              order: -1,
            },
          },
          {
            $limit: Number(videoLimit),
          },
          {
            $project: {
              _id: 1,
              title: 1,
              thumb: 1,
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
        privacy: 1,
        createdAt: 1,
        updatedAt: 1,
        itemList: 1,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: page }],
      },
    },
  );
  const playlists = await Playlist.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: playlists[0]?.data,
    qtt: playlists[0]?.data?.length,
    totalQtt: playlists[0]?.totalCount[0]?.total,
    currPage: page,
    totalPage: Math.ceil(playlists[0]?.totalCount[0]?.total / page) || 0,
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
          subscriberId: userId,
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
          subscriberId: userId,
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
            userId: userId,
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

// const getTagsList = async (req, res) => {
//   const { limit, page, sort, search, priorityList } = req.query;

//   const page = Number(limit) || 5;
//   const page = Number(page) || 1;

//   const skip = (page - 1) * page;

//   const validator = new Validator();

//   const errors = {
//     invalidKey: [],
//     invalidValue: [],
//   };

//   const searchObj = {};

//   const searchEntries = Object.entries(search || {});

//   if (searchEntries.length > 0) {
//     const searchFuncObj = {
//       title: (title) => {
//         validator.isString("title", title);
//         searchObj.title = searchWithRegex(title);
//       },
//     };

//     for (const [key, value] of searchEntries) {
//       if (!searchFuncObj[key]) {
//         errors.invalidKey.push(key);
//         continue;
//       }

//       try {
//         searchFuncObj[key](value);
//       } catch (error) {
//         errors.invalidValue.push(key);
//       }
//     }
//   }

//   let sortObj = {};

//   const sortEntries = Object.entries(sort || {});

//   if (sortEntries.length > 0) {
//     const sortKeys = new Set(["createdAt"]);
//     const sortValueEnum = {
//       1: 1,
//       "-1": -1,
//     };

//     for (const [key, value] of sortEntries) {
//       if (!sortKeys.has(key)) {
//         errors.invalidKey(key);
//         continue;
//       }

//       if (!sortValueEnum[value]) {
//         errors.invalidValue(value);
//         continue;
//       }

//       sortObj[key] = sortValueEnum[value];
//     }
//   }

//   for (const error in errors) {
//     if (errors[error].length > 0) {
//       return res
//         .status(StatusCodes.BAD_REQUEST)
//         .json({ errors, message: "Failed to get data from server" });
//     }
//   }

//   if (Object.keys(sortObj).length < 1) {
//     sortObj.createdAt = -1;
//   }

//   const pipeline = [{ $match: searchObj }];

//   if (priorityList && priorityList.length > 0) {
//     sortObj = { priority: -1, ...sortObj };

//     pipeline.push(
//       {
//         $set: {
//           _idStr: { $toString: "$_id" },
//         },
//       },
//       {
//         $set: {
//           priority: { $cond: [{ $in: ["$_idStr", priorityList] }, 1, 0] },
//         },
//       },
//     );
//   }

//   pipeline.push(
//     {
//       $sort: sortObj,
//     },
//     {
//       $facet: {
//         totalCount: [{ $count: "total" }],
//         data: [{ $skip: skip }, { $limit: page }],
//       },
//     },
//   );

//   const tags = await Tag.aggregate(pipeline);

//   res.status(StatusCodes.OK).json({
//     data: tags[0]?.data,
//     qtt: tags[0]?.data?.length,
//     totalQtt: tags[0]?.totalCount[0]?.total,
//     currPage: page,
//     totalPages: Math.ceil(tags[0]?.totalCount[0]?.total / page),
//   });
// };

// get random tags
const getTagsList = async (req, res) => {
  const { size = 5 } = req.query;

  const tagList = await Tag.aggregate([
    { $sample: { size: Number(size) } },
    {
      $project: {
        title: 1,
        slug: 1,
      },
    },
  ]);

  res.status(StatusCodes.OK).json({ data: tagList });
};

module.exports = {
  getRandomData,
  getVideoList,
  getDataList,
  getSearchingDatas,
  getChannelInfo,
  getChannelData,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShorts,
  getPlaylistDetails,
  getTagsList,
};
