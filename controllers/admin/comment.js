const { User, Video, Comment } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");

const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
  InvalidError,
} = require("../../errors");

const { searchWithRegex } = require("../../utils/other");
const { CommentValidator, Validator } = require("../../utils/validate");
const { sessionWrap } = require("../../utils/session");
const {
  createComment,
  updateComment,
  deleteComment,
  deleteManyComment,
} = require("../../service/comment-service");

const createCmt = async (req, res) => {
  const neededKeys = ["userId", "videoId", "cmtText"];

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError(
      `Please provide these ${neededKeys.join(" ")} fields to create comment `,
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
  const { userId, ...commentData } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${userId}`);
  }

  await createComment(userId, commentData);

  res.status(StatusCodes.CREATED).json({ msg: "Comment created" });
};

const getCmts = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const limitNumber = Number(limit) || 5;
  const pageNumber = Number(page) || 1;

  const skip = (pageNumber - 1) * limitNumber;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const directSearchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      email: (email) => {
        validator.isString("email", email);

        searchObj["user_info.email"] = searchWithRegex(email);
      },
      name: (name) => {
        validator.isString("name", name);

        searchObj["user_info.name"] = searchWithRegex(name);
      },
      title: (title) => {
        validator.isString("title", title);

        searchObj["video_info.title"] = searchWithRegex(title);
      },
      content: (content) => {
        validator.isString("content", content);

        directSearchObj["cmtText"] = searchWithRegex(content);
      },
      type: (type) => {
        directSearchObj["replied_parent_cmt_id"] = {
          $exists: type === "reply",
        };
      },
      videoId: (videoId) => {
        directSearchObj["video_id"] = new mongoose.Types.ObjectId(videoId);
      },
    };

    for (const [key, value] of searchEntries) {
      if (!searchFuncObj[key] && !value) {
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
    const sortKeys = new Set([
      "createdAt",
      "view",
      "like",
      "dislike",
      "totalCmt",
    ]);

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
      $match: directSearchObj,
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
        from: "videos",
        localField: "video_id",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1, thumb: 1 } }],
        as: "video_info",
      },
    },
    {
      $unwind: "$video_info",
    },
    {
      $set: {
        _idStr: { $toString: "$_id" },
        _videoIdStr: { $toString: "$video_id" },
      },
    },
    {
      $match: searchObj,
    },
    {
      $project: {
        _id: 1,
        title: 1,
        user_info: 1,
        video_info: 1,
        cmtText: 1,
        createdAt: 1,
        like: 1,
        dislike: 1,
        replied_parent_cmt_id: 1,
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

  const comments = await Comment.aggregate(pipeline);
  console.log("🚀 ~ comments:", comments);

  res.status(StatusCodes.OK).json({
    data: comments[0]?.data,
    qtt: comments[0]?.data?.length,
    totalQtt: comments[0]?.totalCount[0]?.total,
    currPage: pageNumber,
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
        from: "comments",
        localField: "replied_parent_cmt_id",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              cmtText: 1,
            },
          },
        ],
        as: "replied_cmt_info",
      },
    },
    {
      $unwind: {
        path: "$replied_cmt_info",
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
        replied_cmt_info: { $ifNull: ["$replied_cmt_info", null] },
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

  try {
    await updateComment(id, {}, req.body);

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
  const { id } = req.params;

  try {
    const cmt = await deleteComment(id, req.user);

    res.status(StatusCodes.OK).json({ msg: "Comment deleted", data: cmt });
  } catch (error) {
    console.error(error);
    throw new InternalServerError(`Failed to delete comment with id ${id}`);
  }
};

const deleteManyCmt = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of video id to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  try {
    await deleteManyComment(idArray);

    res.status(StatusCodes.OK).json({
      msg: `Comments with the following IDs have been deleted: ${idArray.join(
        ", ",
      )}`,
    });
  } catch (error) {
    throw error;
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
