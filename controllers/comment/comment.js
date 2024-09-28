const { User, Video, Comment, CmtReact } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");

const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
} = require("../../errors");

const createCmt = async (req, res) => {
  const neededKeys = ["userId", "videoId", "cmtText"];

  if (Object.values(req.body).length === 0) {
    throw new BadRequestError(
      `Please provide these ${neededKeys.join(" ")}fields to create comment `
    );
  }

  let invalidFields = neededKeys.filter((key) => {
    if (!req.body[key]) {
      return key;
    }
  });

  if (invalidFields.length > 0) {
    throw new BadRequestError(
      `Missing required fields: ${invalidFields.join(", ")} `
    );
  }

  const user = await User.findById(req.body.userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${req.body.userId}`);
  }

  const video = await Video.updateOne(
    { _id: req.body.videoId },
    { $inc: { totalCmt: 1 } }
  );

  if (video.matchedCount === 0) {
    throw new NotFoundError(`Not found video with id ${req.body.videoId}`);
  }

  let data = {
    user_id: req.body.userId,
    video_id: req.body.videoId,
    cmtText: req.body.cmtText,
  };
  let replyCmt;

  if (req.body.replyId) {
    replyCmt = await Comment.findById(req.body.replyId);

    if (!replyCmt) {
      throw new NotFoundError(`Not found comment with id ${req.body.replyId}`);
    }

    if (replyCmt.video_id?.toString() !== req.body.videoId) {
      throw new BadRequestError(
        "Reply comment should belong to the same video"
      );
    }

    let cmtId = req.body.replyId;

    if (replyCmt?.replied_parent_cmt_id) {
      cmtId = replyCmt?.replied_parent_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_parent_cmt_id;
    } else if (replyCmt?.replied_cmt_id) {
      cmtId = replyCmt?.replied_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_cmt_id;
    }

    await Comment.updateOne({ _id: cmtId }, { $inc: { replied_cmt_total: 1 } });

    data["replied_cmt_id"] = req.body.replyId;
  }

  if (req.query.like) {
    data.like = req.query.like;
  }

  if (req.query.dislike) {
    data.dislike = req.query.dislike;
  }

  const cmt = await Comment.create(data);

  res.status(StatusCodes.CREATED).json({ msg: "Comment created", data: cmt });
};

const getCmts = async (req, res) => {
  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "createdAt"
  );

  let findObj = {};

  findParams.forEach((item) => {
    if (item === "email") {
      findObj["user_info.email"] = { $regex: req.query[item], $options: "i" };
    } else if (item === "title") {
      findObj["video_info.title"] = { $regex: req.query[item], $options: "i" };
    } else if (item === "reply") {
      findObj["replied_cmt_id"] = { $exists: JSON.parse(req.query[item]) };
    } else if (item === "id") {
      findObj["_idStr"] = { $regex: req.query[item], $options: "i" };
    }
  });

  let sortNum = 1;

  if (req.query.createdAt === "mới nhất") {
    sortNum = -1;
  }

  const pipeline = [
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
        from: "videos", // Collection users mà bạn muốn join
        localField: "video_id", // Trường trong collection videos (khóa ngoại)
        foreignField: "_id", // Trường trong collection users (khóa chính)
        as: "video_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: "$video_info",
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
        "user_info.email": 1,
        "video_info.title": 1,
        cmtText: 1,
        createdAt: 1,
        like: 1,
        dislike: 1,
        replied_cmt_id: 1,
        replied_cmt_total: 1,
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

  let result = Comment.aggregate(pipeline);

  const comments = await result;

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(comments[0]?.totalCount[0]?.total / limit) | 1,
  });
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

const getCmtDetails = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide comment ID");
  }

  const cmt = await Comment.aggregate([
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
        as: "user_info",
      },
    },
    {
      $unwind: "$user_info",
    },
    {
      $lookup: {
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $project: {
        _id: 1,
        "user_info._id": 1,
        "user_info.email": 1,
        "video_info._id": 1,
        replied_cmt_id: 1,
        replied_cmt_total: 1,
        cmtText: 1,
        like: 1,
        dislike: 1,
      },
    },
  ]);

  if (!cmt) {
    throw new NotFoundError(`Cannot find comment with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: cmt[0] });
};

const updateCmt = async (req, res) => {
  const { id } = req.params;

  if (id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError("There is nothing to update.");
  }

  const updatedKey = ["cmtText", "like", "dislike"];

  let updateData = {};

  let emptyList = [];

  let notAllowValue = [];

  for (const [key, value] of Object.entries(req.body)) {
    if (updatedKey.includes(key)) {
      if (value === "") {
        emptyList.push(key);
      } else {
        updateData[key] = value;
      }
    } else {
      notAllowValue.push(key);
    }
  }

  if (notAllowValue.length > 0) {
    throw new BadRequestError(
      `The comment cannot contain the following fields: ${notAllowValue.join(
        ", "
      )}`
    );
  }

  if (emptyList.length > 0) {
    throw new BadRequestError(`${emptyList.join(", ")} cannot be empty`);
  }

  const cmt = await Comment.updateOne({ _id: id }, updateData);

  if (cmt.modifiedCount === 0) {
    throw new InternalServerError(`Failed to update comment`);
  }

  res.status(StatusCodes.OK).json({ msg: "Comment updated" });
};

const deleteCmt = async (req, res) => {
  const { id } = req.params;

  if (!id || id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  const foundedCmt = await Comment.findById(id);

  if (!foundedCmt) {
    throw new NotFoundError(`Cannot find comment with id ${id}`);
  }
  if (
    req.user.role !== "admin" &&
    req.user.userId !== foundedCmt.user_id.toString()
  ) {
    throw new BadRequestError(
      `Comment with id ${id} does not belong to user with id ${req.user.userId}`
    );
  }

  const cmt = await Comment.findByIdAndDelete(id);

  await Video.findOneAndUpdate(
    { _id: cmt.video_id },
    { $inc: { totalCmt: -1 } }
  );

  if (cmt.replied_parent_cmt_id) {
    await Comment.updateOne(
      { _id: cmt.replied_parent_cmt_id },
      { $inc: { replied_cmt_total: -1 } }
    );
  } else if (cmt.replied_cmt_id) {
    await Comment.updateOne(
      { _id: cmt.replied_cmt_id },
      { $inc: { replied_cmt_total: -1 } }
    );
  }

  if (cmt.like > 0 || cmt.dislike > 0) {
    await CmtReact.deleteMany({ cmt_id: cmt._id });
  }

  if (cmt.replied_cmt_total > 0) {
    const filter = {
      video_id: cmt.video_id,
      $or: [{ replied_cmt_id: cmt._id }, { replied_parent_cmt_id: cmt._id }],
    };

    const dltCmtList = await Comment.find(filter);

    await Comment.deleteMany(filter);
    const qtt = dltCmtList.length;
    await Video.findOneAndUpdate(
      { _id: cmt.video_id },
      { $inc: { totalCmt: -qtt } }
    );

    const promiseList = dltCmtList.reduce((acc, item) => {
      if (item.like > 0 || item.dislike > 0) {
        acc.push(CmtReact.deleteMany({ cmt_id: item._id }));
      }
      return acc;
    }, []);

    await Promise.all(promiseList);
  }

  if (!cmt) {
    throw new InternalServerError(`Failed to delete comment with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ msg: "Comment deleted", data: cmt });
};

const deleteManyCmt = async (req, res) => {
  const { idList } = req.body;

  if (!idList) {
    throw new BadRequestError("Please provide idList");
  }
  if (!Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  let notFoundedCmts;

  if (req.user.role !== "admin") {
    notFoundedCmts = await Promise.all(
      idList.map(async (id) => {
        const cmt = await Comment.findById(id);
        if (!cmt) {
          return id;
        }
        if (req.user.userId !== cmt.user_id.toString()) {
          throw new BadRequestError(
            `Comment with id ${id} does not belong to user with id ${req.user.userId}`
          );
        }
        return null;
      })
    );
  } else {
    notFoundedCmts = await Promise.all(
      idList.map(async (id) => {
        const cmt = await Comment.findById(id);
        if (!cmt) {
          return id;
        }
        return null;
      })
    );
  }

  notFoundedCmts = notFoundedCmts.filter((id) => id !== null);

  if (notFoundedCmts.length > 0) {
    throw new BadRequestError(
      `The following video IDs could not be found: ${notFoundedCmts.join(", ")}`
    );
  }
  let dltCmts = [];

  await Promise.all(
    idList.map(async (id) => {
      const cmt = await Comment.findByIdAndDelete(id);

      await Video.updateOne({ _id: cmt.video_id }, { $inc: { totalCmt: -1 } });

      dltCmts.push(cmt);

      if (cmt.like > 0 || cmt.dislike > 0) {
        await CmtReact.deleteMany({ cmt_id: cmt._id });
      }

      if (cmt.replied_parent_cmt_id) {
        await Comment.updateOne(
          { _id: cmt.replied_parent_cmt_id },
          { $inc: { replied_cmt_total: -1 } }
        );
      } else if (cmt.replied_cmt_id) {
        await Comment.updateOne(
          { _id: cmt.replied_cmt_id },
          { $inc: { replied_cmt_total: -1 } }
        );
      }
    })
  );

  let replyList = [];

  await Promise.all(
    dltCmts.map(async (item) => {
      const filter = {
        video_id: item?.video_id,
        $or: [
          { replied_cmt_id: item?._id },
          { replied_parent_cmt_id: item?._id },
        ],
      };

      if (item?.replied_cmt_total > 0) {
        const replyCmts = await Comment.find(filter);
        await Video.updateOne(
          { _id: item?.video_id },
          { $inc: { totalCmt: -replyCmts.length } }
        );
        replyList.push(...replyCmts);
        await Comment.deleteMany(filter);
      }
    })
  );

  const promiseList = replyList.reduce((acc, item) => {
    if (item?.like > 0 || item?.dislike > 0) {
      acc.push(CmtReact.deleteMany({ cmt_id: item?._id }));
    }
    return acc;
  }, []);

  await Promise.all(promiseList);

  res.status(StatusCodes.OK).json({
    msg: `Comments with the following IDs have been deleted: ${idList.join(
      ", "
    )}`,
  });
};

module.exports = {
  createCmt,
  getCmts,
  getVideoCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
};
