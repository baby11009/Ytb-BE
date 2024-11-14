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

  const { userId, videoId, cmtText, replyId, like, dislike } = req.body;

  const user = await User.findById(req.body.userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${userId}`);
  }

  let data = {
    user_id: userId,
    video_id: videoId,
    cmtText: cmtText,
  };

  if (replyId) {
    const replyCmt = await Comment.findById(replyId);

    if (!replyCmt) {
      throw new NotFoundError(`Not found comment with id ${replyId}`);
    }

    if (replyCmt.video_id?.toString() !== videoId) {
      throw new BadRequestError(
        "Reply comment should belong to the same video"
      );
    }

    let cmtId = replyId;

    if (replyCmt?.replied_parent_cmt_id) {
      cmtId = replyCmt?.replied_parent_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_parent_cmt_id;
    } else if (replyCmt?.replied_cmt_id) {
      cmtId = replyCmt?.replied_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_cmt_id;
    }

    await Comment.updateOne({ _id: cmtId }, { $inc: { replied_cmt_total: 1 } });

    data["replied_cmt_id"] = replyId;
    data["replied_user_id"] = replyCmt.user_id;
  }

  if (like) {
    data.like = like;
  }

  if (dislike) {
    data.dislike = dislike;
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
    } else if (item === "videoId") {
      findObj["_videoIdStr"] = { $regex: req.query[item], $options: "i" };
    }
  });

  let sortNum = 1;

  if (req.query.createdAt === "mới nhất") {
    sortNum = -1;
  }

  const pipeline = [
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
      $lookup: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              avatar: 1,
            },
          },
        ],
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
      $lookup: {
        from: "videos", // Collection users mà bạn muốn join
        localField: "video_id", // Trường trong collection videos (khóa ngoại)
        foreignField: "_id", // Trường trong collection users (khóa chính)
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "video_info", // Tên mảng để lưu kết quả join
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
        _videoIdStr: { $toString: "$video_id" },
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
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        video_info: 1,
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
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
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
      $lookup: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
            },
          },
        ],
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
      $lookup: {
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $project: {
        _id: 1,
        user_info: 1,
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        video_info: 1,
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

  const cmt = await Comment.deleteOne({ _id: id });

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

  let notFoundedCmts = await Promise.all(
    idList.map(async (id) => {
      const cmt = await Comment.findById(id);
      if (!cmt) {
        return id;
      }
      return null;
    })
  );

  notFoundedCmts = notFoundedCmts.filter((id) => id !== null);

  if (notFoundedCmts.length > 0) {
    throw new BadRequestError(
      `The following video IDs could not be found: ${notFoundedCmts.join(", ")}`
    );
  }

  const deleteComments = idList.reduce((acc, id) => {
    acc.push(Comment.deleteOne({ _id: id }));

    return acc;
  }, []);

  await Promise.all(deleteComments);

  res.status(StatusCodes.OK).json({
    msg: `Comments with the following IDs have been deleted: ${idList.join(
      ", "
    )}`,
  });
};

module.exports = {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
};
