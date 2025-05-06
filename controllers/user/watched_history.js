const {
  BadRequestError,
  NotFoundError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { encodedWithZlib, decodedWithZlib } = require("../../utils/other");

const { WatchedHistory, Video } = require("../../models");

const setWatchedHistoryList = async (req, res) => {
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

const getWatchedHistoryList = async (req, res) => {
  const { userId } = req.user;
  const { cursors } = req.query;
  console.log("🚀 ~ cursors:", cursors);

  const limit = Number(req.query.limit) || 40;

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
                    type: 1,
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
      condition: !cursorsData || cursorsData?.lastShortEndDate,
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

  const [videoHistories = [], shortHistories = []] = await Promise.all(
    promiseList,
  );

  const seperateDataBaseOnDate = (videoHistories, shortHistories) => {
    const objectData = {};

    if (videoHistories.length) {
      videoHistories.forEach((videoHistory) => {
        const lastWatchedAt = new Date(videoHistory.last_watched_at);
        const lastWatchedDate =
          lastWatchedAt.getDate() +
          "/" +
          (lastWatchedAt.getMonth() + 1) +
          "/" +
          lastWatchedAt.getFullYear();

        if (!objectData[lastWatchedDate]) {
          objectData[lastWatchedDate] = { video: [] }; // Khởi tạo đối tượng với mảng video
        }
        objectData[lastWatchedDate].video.push(videoHistory);
      });
    }

    if (shortHistories.length) {
      shortHistories.forEach((shortHistory) => {
        const lastWatchedAt = new Date(shortHistory.last_watched_at);
        const lastWatchedDate =
          lastWatchedAt.getDate() +
          "/" +
          (lastWatchedAt.getMonth() + 1) +
          "/" +
          lastWatchedAt.getFullYear();

        // Khởi tạo nếu chưa có, và thêm short vào mảng
        if (!objectData[lastWatchedDate]) {
          objectData[lastWatchedDate] = { short: [] };
        } else if (!objectData[lastWatchedDate]?.short) {
          objectData[lastWatchedDate].short = [];
        }
        objectData[lastWatchedDate].short.push(shortHistory);
      });
    }

    return objectData;
  };

  const data = seperateDataBaseOnDate(
    videoHistories.length ? videoHistories[0].data : [],
    shortHistories.length ? shortHistories[0].data : [],
  );

  let nextCursors = null;

  if (
    videoHistories.length &&
    videoHistories[0].total[0].size > videoHistories[0].data.length
  ) {
    nextCursors = {
      lastVideoEndDate:
        videoHistories[0].data[videoHistories[0].data.length - 1]
          .last_watched_at,
    };
  }

  if (
    shortHistories.length &&
    shortHistories[0].total[0].size > shortHistories[0].data.length
  ) {
    nextCursors = {
      lastShortEndDate:
        shortHistories[0].data[shortHistories[0].data.length - 1]
          .last_watched_at,
    };
  }

  let encodedCursors = null;
  if (nextCursors) {
    encodedCursors = encodedWithZlib(nextCursors);
  }

  res.status(200).json({ data, cursors: encodedCursors });
};

const deleteWatchedHistory = async (req, res) => {
  const { historyId } = req.params;
  const { userId } = req.user;

  const history = await WatchedHistory.findByIdAndDelete({
    _id: historyId,
    user_id: userId,
  });

  if (!history) {
    throw NotFoundError(`Not found history with id ${historyId}`);
  }

  res.status(StatusCodes.OK).json({ deletedData: history });
};

const deleteAllWatchedHistory = async (req, res) => {
  const { userId } = req.user;

  const foundedHistoryList = await WatchedHistory.find({ user_id: userId });

  if (foundedHistoryList.length < 1) {
    res.status(StatusCodes.OK).send("No content founded");
  }
};

module.exports = {
  setWatchedHistoryList,
  getWatchedHistoryList,
  deleteWatchedHistory,
  deleteAllWatchedHistory,
};
