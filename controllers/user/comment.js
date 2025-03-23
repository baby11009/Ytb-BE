const { User, Video, Comment, CmtReact } = require("../../models/index.js");
const { StatusCodes } = require("http-status-codes");
const { getIo } = require("../../socket.js");
const mongoose = require("mongoose");

const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
} = require("../../errors/index.js");

const createCmt = async (req, res) => {
  const neededKeys = ["videoId", "cmtText"];

  const io = getIo();

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

  const { userId } = req.user;

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
      // If comment is in commen tre
      cmtId = replyCmt?.replied_parent_cmt_id;
      data["replied_parent_cmt_id"] = replyCmt?.replied_parent_cmt_id;
    } else {
      data["replied_parent_cmt_id"] = replyId;
    }

    const parentCmt = await Comment.findOneAndUpdate(
      { _id: cmtId },
      { $inc: { replied_cmt_total: 1 } },
      { returnDocument: "after" },
    );

    if (parentCmt) {
      io.emit(`update-parent-comment-${userId}`, parentCmt);
    }

    data["replied_cmt_id"] = replyId;
    data["replied_user_id"] = replyCmt.user_id;
  }

  const cmt = await Comment.create(data);

  if (cmt) {
    const createdCmt = await Comment.aggregate([
      { $match: { _id: cmt._id } },
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

    let event = `create-comment-${userId}`;
    if (replyId) {
      event = `create-reply-comment-${userId}`;
    }
    io.emit(event, createdCmt[0]);
  }

  res.status(StatusCodes.CREATED).json({ msg: "Comment created", data: cmt });
};

const getCmts = async (req, res) => {
  const { userId } = req.user;

  const { limit, page, search, sort } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncsObj = {
      videoTitle: (title) => {
        searchObj["video_info.title"] = { $regex: title, $options: "i" };
      },
      text: (value) => {
        searchObj["cmtText"] = { $regex: value, $options: "i" };
      },
    };

    for (const [key, value] of searchEntries) {
      if (searchFuncsObj[key]) {
        searchFuncsObj[key](value);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt", "like", "dislike"]);

    for (const [key, value] of sortEntries) {
      if (sortKeys.has(key)) {
        sortObj[key] = Number(value);
      }
    }
  } else {
    sortObj = {
      createdAt: -1,
    };
  }

  const pipeline = [
    {
      $addFields: {
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

const getVideoComments = async (req, res) => {
  const { userId } = req.user;

  const { sort, limit, page } = req.query;

  const limitNum = Number(limit);
  const pageNum = Number(page);

  const skip = (pageNum - 1) * limitNum;

  const findObj = {};

  const findQueryKey = Object.keys(req.query).filter(
    (key) => key !== "sort" && key !== "limit" && key !== "page",
  );

  const findFuncObj = {
    text: (syntax) => {
      findObj["cmtText"] = syntax;
    },
    videoId: (syntax) => {
      findObj["videoIdStr"] = syntax;
    },
  };

  findQueryKey.forEach((key) => {
    const syntax = { $regex: req.query[key], $options: "i" };
    if (findFuncObj[key] && req.query[key]) {
      findFuncObj[key](syntax);
    } else if (req.query[key]) {
      findObj[key] = syntax;
    }
  });

  let sortObj = {};

  let sortDateObj = {};

  if (sort && Object.keys(sort).length > 0) {
    const uniqueSortKeys = [];

    const sortKeys = ["createdAt"];
    let unique = [];
    let uniqueValue;
    for (const [key, value] of Object.entries(sort)) {
      if (sortKeys.includes(key)) {
        sortDateObj[key] = Number(value);
      } else if (uniqueSortKeys.includes(key)) {
        unique.push(key);
        uniqueValue = Number(value);
      }
    }

    if (unique.length > 1) {
      throw new BadRequestError(
        `Only one sort key in ${uniqueSortKeys.join(", ")} is allowed`,
      );
    } else if (unique.length > 0) {
      sortObj[unique[0]] = uniqueValue;
    }
  } else {
    sortDateObj = {
      createdAt: -1,
    };
  }

  const combinedSort = { ...sortObj, ...sortDateObj };

  const pipeline = [
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
          {
            $project: {
              _id: 1,
              user_id: 1,
              title: 1,
              thumb: 1,
              description: 1,
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
              description: { $ifNull: ["$description", null] },
              type: 1,
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
      $addFields: {
        userIdStr: { $toString: "$video_info.user_id" },
        videoIdStr: { $toString: "$video_info.video" },
      },
    },
    {
      $match: {
        userIdStr: userId,
        ...findObj,
      },
    },
    {
      $sort: combinedSort,
    },
    {
      $project: {
        _id: 1,
        cmtText: 1,
        video_info: 1,
        replied_user_info: {
          $ifNull: ["$replied_user_info", null],
        },
        createdAt: 1,
        video_info: 1,
        user_info: 1,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ];

  const comments = await Comment.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total,
    currPage: Number(page),
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
      $addFields: {
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

  if (!id || id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError("There is nothing to update.");
  }

  const foundedCmt = await Comment.findOne({ _id: id });

  if (foundedCmt.user_id.toString() !== userId) {
    throw new ForbiddenError(
      "You don't have permission to update this comment.",
    );
  }

  const updateFuncObj = {
    cmtText: (value) => {
      if (value === "") {
        emptyList.push("cmtText");
      } else {
        updateData["cmtText"] = value;
      }
    },
  };

  let updateData = {};

  let emptyList = [];

  let notAllowValue = [];
  if (Object.keys(req.body).length > 0) {
    for (const [key, value] of Object.entries(req.body)) {
      if (updateFuncObj[key]) {
        updateFuncObj[key](value);
      } else {
        notAllowValue.push(key);
      }
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

  const cmt = await Comment.findOneAndUpdate({ _id: id }, updateData, {
    returnDocument: "after",
  });

  if (!cmt) {
    throw new InternalServerError(`Failed to update comment`);
  }
  const io = getIo();
  let event = `update-comment-${userId}`;
  if (cmt.replied_cmt_id) {
    event = `update-reply-comment-${userId}`;
  }
  io.emit(event, cmt);

  res.status(StatusCodes.OK).json({ msg: "Comment updated", data: foundedCmt });
};

const deleteCmt = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  if (!id || id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  const foundedCmt = await Comment.aggregate([
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
        userIdStr: { $toString: "$user_id" },
      },
    },
    {
      $match: {
        _idStr: id,
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, user_id: 1 } }],
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $addFields: {
        videoCreatedUserId: { $toString: "$video_info.user_id" },
      },
    },
    {
      $project: {
        _id: 1,
        userIdStr: 1,
        video_info: 1,
        videoCreatedUserId: 1,
        replied_cmt_id: 1,
        replied_parent_cmt_id: 1,
      },
    },
  ]).then((data) => data[0]);

  if (!foundedCmt) {
    throw new NotFoundError(`Cannot find comment with id ${id}`);
  }

  if (
    userId !== foundedCmt.userIdStr &&
    userId !== foundedCmt.videoCreatedUserId
  ) {
    throw new BadRequestError(
      `Comment with id ${id} does not belong to user with id ${req.user.userId}`,
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cmt = await Comment.findOneAndDelete(
      { _id: id },
      { returnDocument: "before", session: session },
    );

    const io = getIo();
    let event = `delete-comment-${userId}`;

    if (cmt.replied_cmt_id) {
      event = `delete-reply-comment-${userId}`;
      const parentCmt = await Comment.findOne({
        _id: cmt.replied_cmt_id,
      }).session(session);
      io.emit(`update-parent-comment-${userId}`, parentCmt);
    }
    io.emit(event, cmt);

    res
      .status(StatusCodes.OK)
      .json({ msg: "Comment deleted", data: foundedCmt });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    throw new InternalServerError(`Failed to delete comment with id ${id}`);
  } finally {
    session.endSession();
  }
};

const deleteManyCmt = async (req, res) => {
  const { idList } = req.body;
  const { userId } = req.user;

  if (!idList) {
    throw new BadRequestError("Please provide idList");
  }
  if (!Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  let notFoundedCmts = await Promise.all(
    idList.map(async (id) => {
      const cmt = Comment.aggregate([
        {
          $addFields: {
            _idStr: { $toString: "$_id" },
            userIdStr: { $toString: "$user_id" },
          },
        },
        {
          $match: {
            _idStr: id,
          },
        },
        {
          $lookup: {
            from: "videos",
            localField: "video_id",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, user_id: 1 } }],
            as: "video_info",
          },
        },
        {
          $unwind: "$video_info",
        },
        {
          $addFields: {
            videoCreatedUserId: { $toString: "$video_info.user_id" },
          },
        },
        {
          $project: {
            _id: 1,
            userIdStr: 1,
            video_info: 1,
            videoCreatedUserId: 1,
          },
        },
      ]).then((data) => data[0]);

      if (!cmt) {
        return id;
      }
      if (userId !== cmt.userIdStr && userId !== videoCreatedUserId) {
        throw new BadRequestError(
          `Comment with id ${id} does not belong to user with id ${userId}`,
        );
      }
      return null;
    }),
  );

  notFoundedCmts = notFoundedCmts.filter((id) => id !== null);

  if (notFoundedCmts.length > 0) {
    throw new BadRequestError(
      `The following video IDs could not be found: ${notFoundedCmts.join(
        ", ",
      )}`,
    );
  }

  const deleteComments = idList.reduce((acc, id) => {
    acc.push(Comment.deleteOne({ _id: id }));

    return acc;
  }, []);

  await Promise.all(deleteComments);

  res.status(StatusCodes.OK).json({
    msg: `Comments with the following IDs have been deleted: ${idList.join(
      ", ",
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
  getVideoComments,
};
