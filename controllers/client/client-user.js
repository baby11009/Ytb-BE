const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const { Subscribe, User, Video } = require("../../models");
const avatarPath = path.join(__dirname, "../../assets/user avatar");

const getAccountInfo = async (req, res) => {
  const id = req.user.userId;

  const user = await User.aggregate([
    { $addFields: { _idStr: { $toString: "$_id" } } },
    { $match: { _idStr: id } },
    {
      $lookup: {
        from: "subscribes",
        pipeline: [
          {
            $addFields: {
              subscriber_idStr: { $toString: "$subscriber_id" },
            },
          },
          {
            $match: {
              subscriber_idStr: id,
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
      },
    },
  ]);

  res.status(StatusCodes.OK).json({ data: user[0] });
};

const settingAccount = async (req, res) => {
  const id = req.user.userId;

  const { ...data } = req.body;

  try {
    if (Object.keys(data).length === 0 && !req.files) {
      throw new BadRequestError("No data provided to update");
    }

    const foundedUser = await User.findOne({ _id: id }).select(
      "name password role confirmed subscriber totalVids banner avatar description"
    );

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const notValidateFields = [];

    const finalObject = {};

    const sameValueFields = [];

    const queryFuncObj = {
      name: (value) => {
        if (foundedUser.name === value) {
          sameValueFields.push("name");
          return;
        }
        finalObject["name"] = value;
      },
      password: async (value) => {
        const samePassword = await foundedUser.comparePassword(value);
        if (samePassword) {
          sameValueFields.push("password");
        } else {
          finalObject["password"] = value;
        }
      },
      description: (value) => {
        if (foundedUser.description === value) {
          sameValueFields.push("description");
          return;
        }
        finalObject["description"] = value;
      },
    };
    if (Object.keys(data).lenght > 0) {
      for (const [key, value] of Object.entries(data)) {
        if (queryFuncObj[key]) {
          const func = queryFuncObj[key];
          if (func.constructor.name === "AsyncFunction") {
            await func(value);
          } else {
            func(value);
          }
        } else {
          notValidateFields.push(key);
        }
      }
    }

    if (notValidateFields.length > 0) {
      throw new BadRequestError(
        `Not accepted theses fields: ${notValidateFields.join(", ")}`
      );
    }

    if (sameValueFields.length > 0) {
      throw new BadRequestError(
        `These fields's value is still the same: ${sameValueFields.join(", ")}`
      );
    }

    if (req.files?.image) {
      finalObject.avatar = req.files.image[0].filename;
    }

    if (req.files?.banner) {
      finalObject.banner = req.files.banner[0].filename;
    }

    await User.updateOne({ _id: id }, finalObject);

    if (foundedUser.avatar !== "df.jpg" && finalObject.avatar) {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg" && finalObject.banner) {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    res.status(StatusCodes.OK).json({ msg: "User updated successfully" });
  } catch (error) {
    if (req.files?.image) {
      deleteFile(req.files.image[0].path);
    }

    if (req.files?.banner) {
      deleteFile(req.files.banner[0].path);
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
        $addFields: {
          subscriber_idStr: { $toString: "$subscriber_id" },
        },
      },
    ];

    // Handle addfields if available or to extend the project
    const addFieldsObj = {
      subscriber_idStr: { $toString: "$subscriber_id" },
    };

    pipeline.push({
      $addFields: addFieldsObj,
    });

    // Handle match object if available or to extend the project
    const matchObj = {
      subscriber_idStr: userId,
    };

    pipeline.push({
      $match: matchObj,
    });

    pipeline.push(
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
      }
    );

    const sortObj = {};
    if (sort && Object.keys(sort).length > 0) {
      const sortEntries = {
        createdAt: [1, -1],
      };
      for (const [key, value] of Object.entries(sort)) {
        if (sortEntries[key] && sortEntries[key].includes(value)) {
          sortObj[key] = value;
        }
      }
    }

    if (Object.keys(sortObj).length < 1) {
      sortObj["createdAt"] = -1; // Set default sort by createdAt if no sort field provided
    }

    pipeline.push(
      {
        $sort: sortObj,
      },
      {
        $project: {
          _id: 0,
          channel_id: 1,
          name: "$channel_info.name",
          email: "$channel_info.email",
          avatar: "$channel_info.avatar",
          subscriber: "$channel_info.subscriber",
          description: "$channel_info.description",
          notify: 1,
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
      }
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
  try {
    const { userId } = req.user;

    const { page, limit, sort } = req.query;

    const dataPage = Number(page) || 1;
    const dataLimit = Number(limit) || 12;
    const skip = (dataPage - 1) * dataLimit;

    const channels = await Subscribe.aggregate([
      {
        $addFields: {
          subscriber_idStr: { $toString: "$subscriber_id" },
        },
      },
      {
        $match: {
          subscriber_idStr: userId,
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

      const pipeline = [];
      const matchQuery = Object.keys(req.query).filter(
        (key) => key !== "page" && key !== "limit" && key !== "sort"
      );
      // handle addFields

      // handle match
      const matchObj = {
        type: "video",
        user_id: { $in: channelIdList },
      };

      if (matchQuery.length > 0) {
        const matchFuncObj = {
          type: (value) => {
            const validValues = new Set(["short", "video"]);
            console.log("🚀 ~  validValues:", [...validValues]);
            if (validValues.has(value)) {
              matchObj["type"] = value;
            }
          },
        };
      }

      pipeline.push({
        $match: matchObj,
      });

      const sortObj = {};
      // handle sort
      if (sort && Object.keys(sort).length > 0) {
        const sortEntries = {
          createdAt: [1, -1],
        };

        for (const [key, value] of Object.entries(sort)) {
          if (sortEntries[key] && sortEntries[key].includes(value)) {
            sortObj[key] = value;
          }
        }
      }

      if (Object.keys(sortObj).length < 1) {
        sortObj.createdAt = -1;
      }

      pipeline.push(
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
            as: "user_info",
          },
        },
        {
          $unwind: "$user_info",
        },
        {
          $project: {
            _id: 0,
            title: 1,
            thumb: 1,
            user_info: 1,
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
        }
      );

      const videos = await Video.aggregate(pipeline);

      resturnData.data = videos[0].data;
      resturnData.qtt = videos[0].totalReturned;
      resturnData.totalQtt = videos[0].totalFound;
      resturnData.totalPage = Math.ceil(videos[0].totalFound / dataLimit) || 0;
    }

    res.status(StatusCodes.OK).json(resturnData);
  } catch (error) {
    console.error(error);
    throw error;
  }
};

module.exports = {
  getAccountInfo,
  getSubscribedChannels,
  settingAccount,
  getSubscribedChannelsVideos,
};
