const { Video, Playlist } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");

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
        title: { $regex: req.query[item], $options: "i" },
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

  let sortNums = -1;
  if (createdAt === "cũ nhất") {
    sortNums = 1;
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
      $sort: { createdAt: sortNums },
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

module.exports = { getVideoList };
