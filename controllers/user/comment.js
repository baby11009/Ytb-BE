const { User, Comment } = require("../../models/index.js");
const { StatusCodes } = require("http-status-codes");
const { emitEvent } = require("../../socket/socket.js");
const { CommentValidator, Validator } = require("../../utils/validate.js");
const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
  InvalidError,
} = require("../../errors/index.js");
const { searchWithRegex } = require("../../utils/other");
const { sessionWrap } = require("../../utils/session");
const {
  sendRealTimeNotification,
} = require("../../service/notification/notification");

const createCmt = async (req, res) => {
  const neededKeys = ["videoId", "cmtText"];

  if (Object.values(req.body).length === 0) {
    throw new BadRequestError(
      `Please provide these ${neededKeys.join(" ")}fields to create comment `,
    );
  }

  const invalidFields = neededKeys.filter((key) => {
    if (!req.body[key]) {
      return key;
    }
  });

  if (invalidFields.length > 0) {
    throw new BadRequestError(
      `Missing required fields: ${invalidFields.join(", ")} `,
    );
  }

  const { userId, name } = req.user;

  const { videoId, cmtText, replyId } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${userId}`);
  }

  const data = {
    user_id: userId,
    video_id: videoId,
    cmtText: cmtText,
  };
  let replyCmt;
  if (replyId) {
    replyCmt = await Comment.findById(replyId);

    if (!replyCmt) {
      throw new NotFoundError(`Not found comment with id ${replyId}`);
    }

    if (replyCmt.video_id?.toString() !== videoId) {
      throw new BadRequestError(
        "Reply comment should belong to the same video",
      );
    }

    if (replyCmt?.replied_parent_cmt_id) {
      // If comment is in commen tree
      data["replied_parent_cmt_id"] = replyCmt?.replied_parent_cmt_id;
    } else {
      data["replied_parent_cmt_id"] = replyId;
    }

    data["replied_cmt_id"] = replyId;
    data["replied_user_id"] = replyCmt.user_id;
  }

  const result = await sessionWrap(async (session) => {
    const cmt = await Comment.create([data], { session });
    if (!cmt) {
      throw new InternalServerError("Failed to create comment");
    }

    return cmt;
  });

  const createdCmt = await Comment.aggregate([
    { $match: { _id: result[0]._id } },
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
      $unwind: {
        path: "$user_info",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
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
        cmtText: 1,
        like: 1,
        dislike: 1,
        replied_parent_cmt_id: 1,
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        replied_cmt_id: 1,
        replied_cmt_total: 1,
        createdAt: 1,
      },
    },
  ]);

  let type = "NORMAL";

  if (replyId) {
    type = "REPLY";

    if (userId.toString() !== replyCmt.user_id.toString()) {
      sendRealTimeNotification({
        senderId: userId,
        receiverId: replyCmt.user_id,
        type: "comment",
        cmtId: createdCmt[0]._id,
        message: `${name} has replied to your comment`,
      });
    }
  }

  emitEvent(`create-comment-${userId}`, {
    data: createdCmt[0],
    type,
  });

  res.status(StatusCodes.CREATED).json({ msg: "Comment created" });
};

const getCmts = async (req, res) => {
  const { userId } = req.user;

  const { limit, page, search, sort } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      videoTitle: (title) => {
        validator.isString("title", title);
        searchObj["video_info.title"] = searchWithRegex(title);
      },
      text: (text) => {
        validator.isString("text", text);

        searchObj["cmtText"] = searchWithRegex(text);
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

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt", "like", "dislike"]);

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
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  if (Object.keys(sortObj).length < 1) {
    sortObj.createdAt = -1;
  }

  const pipeline = [
    {
      $set: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$user_id" },
      },
    },
    {
      $match: {
        userIdStr: userId,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
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
        pipeline: [
          { $project: { _id: 1, thumb: 1, title: 1, type: 1, description: 1 } },
        ],
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $match: searchObj,
    },
    {
      $sort: sortObj,
    },
    {
      $project: {
        _id: 1,
        title: 1,
        video_info: 1,
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        cmtText: 1,
        createdAt: 1,
        like: 1,
        dislike: 1,
        replied_cmt_id: 1,
        replied_cmt_total: 1,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ];

  const comments = await Comment.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(comments[0]?.totalCount[0]?.total / limit) || 1,
  });
};

const getCmtDetails = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide comment ID");
  }

  const cmt = await Comment.aggregate([
    {
      $set: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$user_id" },
      },
    },
    {
      $match: {
        userIdStr: userId,
        _idStr: id,
      },
    },
    {
      $lookuo: {
        from: "users",
        localField: "replied_user_id",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
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
        replied_cmt_id: 1,
        replied_cmt_total: 1,
        replied_user_info: { $ifNull: ["$replied_user_info", null] },
        cmtText: 1,
        like: 1,
        dislike: 1,
      },
    },
  ]);

  if (cmt.length < 1) {
    throw new NotFoundError(`Cannot find comment with id ${id}`);
  }

  res.status(StatusCodes.OK).json({ data: cmt[0] });
};

const updateCmt = async (req, res) => {
  const { id } = req.params;

  const { userId } = req.user;

  if (Object.keys(req.body).length < 1) {
    throw new BadRequestError("There is nothing to update.");
  }

  const foundedCmt = await Comment.findOne({ _id: id, user_id: userId });

  if (!foundedCmt) {
    throw new NotFoundError(`Not found comment with id ${id}`);
  }

  try {
    const updateDatas = new CommentValidator(req.body, foundedCmt, [
      "cmtText",
    ]).getValidatedUpdateData();

    const cmt = await Comment.findOneAndUpdate({ _id: id }, updateDatas, {
      returnDocument: "after",
    });

    if (!cmt) {
      throw new InternalServerError(
        `There is something wrong with the server, please try again`,
      );
    }

    let type = "NORMAL";
    if (cmt.replied_cmt_id) {
      type = "REPLY";
    }
    emitEvent(`update-comment-${userId}`, {
      type,
      data: cmt,
    });

    res.status(StatusCodes.OK).json({ msg: "Comment updated" });
  } catch (error) {
    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }
    throw error;
  }
};

const deleteCmt = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  const foundedCmt = await Comment.aggregate([
    {
      $set: {
        _idStr: { $toString: "$_id" },
      },
    },
    { $match: { _idStr: id } },
    {
      $lookup: {
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        pipeline: [{ $project: { user_id: 1 } }],
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $project: {
        user_id: 1,
        video_info: 1,
        replied_cmt_id: 1,
        replied_parent_cmt_id: 1,
        replied_cmt_total: 1,
      },
    },
  ]);

  if (
    foundedCmt.length < 1 ||
    (foundedCmt[0].user_id.toString() !== userId.toString() &&
      foundedCmt[0].video_info.user_id.toString() !== userId.toString())
  ) {
    throw new NotFoundError(`Not found comment with id ${id}`);
  }

  try {
    await sessionWrap(async (session) => {
      await Comment.deleteOne({ _id: id }, { session });
    });

    let type = "NORMAL";

    if (foundedCmt[0].replied_cmt_id) {
      type = "REPLY";
    }

    emitEvent(`delete-comment-${userId}`, {
      type,
      data: foundedCmt[0],
    });

    res
      .status(StatusCodes.OK)
      .json({ msg: "Comment deleted", data: foundedCmt });
  } catch (error) {
    console.log("User delete one comment: ", error);
    throw new InternalServerError(`Failed to delete comment with id ${id}`);
  }
};

const deleteManyCmt = async (req, res) => {
  const { userId } = req.user;

  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of video id to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  const foundedCmts = await Comment.find({
    _id: { $in: idArray },
    user_id: userId,
  }).select("_id");

  const cmtListNeedToDelete = [];

  if (foundedCmts.length < 1) {
    throw new BadRequestError(
      `Not found comments with id : ${idArray.join(", ")}`,
    );
  } else if (foundedCmts.length !== idArray.length) {
    const foundedCmtIdList = new Set();

    for (const cmt of foundedCmts) {
      //Remove reply comment ID if the root comment is included in the list,
      //  because in cascade deletion, the entire comment tree will be deleted if the root comment got removed.
      if (
        !cmt.replied_parent_cmt_id ||
        !idArray.includes(cmt.replied_parent_cmt_id)
      ) {
        cmtListNeedToDelete.push(cmt._id);
      }

      foundedCmtIdList.add(cmt._id);
    }

    const notFoundedCmts = idArray.filter((id) => !foundedCmtIdList.has(id));

    if (notFoundedCmts.length > 0) {
      throw new BadRequestError(
        `Not found comments with id : ${notFoundedCmts.join(", ")}`,
      );
    }
  }

  try {
    await sessionWrap(async (session) => {
      await Comment.deleteMany(
        { _id: { $in: cmtListNeedToDelete } },
        { session },
      );
    });

    res.status(StatusCodes.OK).json({
      msg: `Comments with the following id have been deleted: ${idArray.join(
        ", ",
      )}`,
    });
  } catch (error) {
    console.log("User delete many comment: ", error);
    throw InternalServerError("Failed to delete many comment");
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
