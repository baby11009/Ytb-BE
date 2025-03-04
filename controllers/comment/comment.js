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

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError(
      `Please provide these ${neededKeys.join(" ")} fields to create comment `,
    );
  }

  let invalidFields = neededKeys.filter((key) => {
    if (!req.body[key]) {
      return key;
    }
  });

  if (invalidFields.length > 0) {
    throw new BadRequestError(
      `Missing required fields: ${invalidFields.join(", ")} `,
    );
  }

  const { userId, videoId, cmtText, replyId, like, dislike } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${userId}`);
  }

  const data = {
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
        "Reply comment should belong to the same video",
      );
    }

    let cmtId = replyId;

    if (replyCmt?.replied_parent_cmt_id) {
      cmtId = replyCmt?.replied_parent_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_parent_cmt_id;
    } else {
      data["replied_parent_cmt_id"] = replyId;
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
  const { limit, page, sort, search } = req.query;

  let limitNumber = Number(limit) || 5;
  let pageNumber = Number(page) || 1;

  let skip = (pageNumber - 1) * limitNumber;

  let matchObj = {};

  const matchFuncsObj = {
    email: (email) => {
      matchObj["user_info.email"] = { $regex: email, $options: "i" };
    },
    title: (title) => {
      matchObj["video_info.title"] = { $regex: title, $options: "i" };
    },
    videoId: (videoId) => {
      matchObj["_videoIdStr"] = videoId;
    },
    reply: (replyId) => {
      matchObj["replied_cmt_id"] = { $exists: JSON.parse(replyId) };
    },
  };

  if (search) {
    const searchKeys = Object.keys(search);
    if (searchKeys.length > 0) {
      for (const key of searchKeys) {
        if (matchFuncsObj[key]) {
          matchFuncsObj[key](search[key]);
        }
      }
    }
  }

  // findParams.forEach((item) => {
  //   if (item === "email") {
  //     matchObj["user_info.email"] = { $regex: req.query[item], $options: "i" };
  //   } else if (item === "title") {
  //     matchObj["video_info.title"] = { $regex: req.query[item], $options: "i" };
  //   } else if (item === "reply") {
  //     matchObj["replied_cmt_id"] = { $exists: JSON.parse(req.query[item]) };
  //   } else if (item === "id") {
  //     matchObj["_idStr"] = { $regex: req.query[item], $options: "i" };
  //   } else if (item === "videoId") {
  //     matchObj["_videoIdStr"] = { $regex: req.query[item], $options: "i" };
  //   }
  // });

  const sortObj = {};

  const sortFuncsObj = {
    createdAt: (value) => {
      const valueList = new Set(["1", "-1"]);
      if (valueList.has(value)) {
        sortObj["createdAt"] = Number(value);
      } else {
        sortObj["createdAt"] = -1;
      }
    },
  };

  const sortKeys = Object.keys(sort);
  if (sortKeys && sortKeys.length > 0) {
    const sortKeys = Object.keys(sort);
    if (sortKeys.length > 0) {
      for (const key of sortKeys) {
        if (sortFuncsObj[key]) {
          sortFuncsObj[key](sort[key]);
        }
      }
    }
  } else {
    sortObj["createdAt"] = -1;
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
      $match: matchObj,
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
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ];

  let result = Comment.aggregate(pipeline);

  const comments = await result;
  console.log("🚀 ~ comments:", matchObj);

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
        ", ",
      )}`,
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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cmt = await Comment.deleteOne({ _id: id }, { session: session });
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({ msg: "Comment deleted", data: cmt });
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    throw new InternalServerError(`Failed to delete comment with id ${id}`);
  } finally {
    session.endSession();
  }
};

const deleteManyCmt = async (req, res) => {
  const idList = req.query?.idList?.split(",");

  if (!idList || idList.length < 1) {
    throw new BadRequestError(
      "Please provide list of comment that you want to delete",
    );
  }

  const foundedCmts = await Comment.find({ _id: { $in: idList } }).select(
    "_id",
  );

  if (foundedCmts.length !== idList.length) {
    const foundedCmtIdList = foundedCmts.map((cmt) => cmt._id.toString());

    const notFoundedCmts = idList.filter(
      (id) => !foundedCmtIdList.includes(id),
    );
    if (notFoundedCmts.length > 0) {
      throw new BadRequestError(
        `The following video IDs could not be found: ${notFoundedCmts.join(
          ", ",
        )}`,
      );
    }
  }

  //Remove reply comment ID if the root comment is included in the list,
  //  because in cascade deletion, the entire comment tree will be deleted if the root comment is removed.
  let commentListNeedToDelete = await Comment.aggregate([
    {
      $addFields: {
        _id_str: { $toString: "$_id" },
        replied_parent_cmt_id_str: { $toString: "$replied_parent_cmt_id" },
      },
    },
    {
      $match: {
        _id_str: { $in: idList },
        replied_parent_cmt_id_str: { $nin: idList },
      },
    },
    { $project: { _id: 1 } },
  ]);

  commentListNeedToDelete = commentListNeedToDelete.map((cmt) =>
    cmt._id.toString(),
  );

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Comment.deleteMany(
      { _id: { $in: commentListNeedToDelete } },
      { session },
    );
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({
      msg: `Comments with the following IDs have been deleted: ${idList.join(
        ", ",
      )}`,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
};
