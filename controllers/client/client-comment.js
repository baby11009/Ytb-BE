const { User, Video, Comment, CmtReact } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");

const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
} = require("../../errors");

const createCmt = async (req, res) => {
  const { userId } = req.user;

  const { videoId, cmtText } = req.body;
  const neededKeys = ["videoId", "cmtText"];

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

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`Not found user with id ${userId}`);
  }

  const video = await Video.updateOne(
    { _id: req.body.videoId },
    { $inc: { totalCmt: 1 } }
  );

  if (video.matchedCount === 0) {
    throw new NotFoundError(`Not found video with id ${req.body.videoId}`);
  }

  let data = {
    user_id: userId,
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
  const { userId } = req.user;
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
      $project: {
        _id: 1,
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
  const { userId } = req.user;

  if (id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError("There is nothing to update.");
  }

  const foundedCmt = await Comment.findOne({ _id: id });

  if (foundedCmt.user_id.toString() !== userId) {
    throw new ForbiddenError(
      "You don't have permission to update this comment."
    );
  }

  const updatedKey = ["cmtText"];

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
  const { userId } = req.user;
  const { id } = req.params;

  if (!id || id === "" || id === ":id") {
    throw new BadRequestError(`Please provide comment id`);
  }

  const foundedCmt = await Comment.findById(id);

  if (!foundedCmt) {
    throw new NotFoundError(`Cannot find comment with id ${id}`);
  }
  if (userId !== foundedCmt.user_id.toString()) {
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
  const { userId } = req.user;

  if (!idList) {
    throw new BadRequestError("Please provide idList");
  }
  if (!Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  let notFoundedCmts;

  notFoundedCmts = await Promise.all(
    idList.map(async (id) => {
      const cmt = await Comment.findById(id);
      if (!cmt) {
        return id;
      }
      if (userId !== cmt.user_id.toString()) {
        throw new BadRequestError(
          `Comment with id ${id} does not belong to user with id ${userId}`
        );
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
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
};
