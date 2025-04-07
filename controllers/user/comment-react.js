const { CmtReact, Comment } = require("../../models");
const { BadRequestError, NotFoundError } = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { emitEvent } = require("../../socket/socket");
const {
  sendRealTimeNotification,
} = require("../../service/notification/notification");

const toggleCmtReact = async (req, res) => {
  const { userId, name } = req.user;
  const { cmtId, type } = req.body;

  if (!cmtId) {
    throw new BadRequestError("Please provide comment id");
  }

  if (!type) {
    throw new BadRequestError("Please provide comment's react type");
  }

  const foundedCmt = await Comment.findById(cmtId);

  if (!foundedCmt) {
    throw new BadRequestError(`Not found comment with id ${cmtId}`);
  }

  let finalData = {
    user_id: userId,
    cmt_id: cmtId,
  };

  const exitsingCmtReact = await CmtReact.findOne(finalData);

  let msg;
  let likeCount = 0;
  let dislikeCount = 0;

  if (exitsingCmtReact) {
    if (exitsingCmtReact.type === type) {
      await CmtReact.deleteOne({ _id: exitsingCmtReact._id });
      msg = `Successfully un${type}d comment`;
      if (type === "like") {
        likeCount = -1;
      } else {
        dislikeCount = -1;
      }
    } else {
      await CmtReact.updateOne({ _id: exitsingCmtReact._id }, { type: type });
      msg = `Successfully change comment react to ${type}`;
      if (type === "like") {
        likeCount = 1;
        dislikeCount = -1;
      } else {
        likeCount = -1;
        dislikeCount = 1;
      }
    }
  } else {
    await CmtReact.create({ ...finalData, type });
    msg = `Successfully ${type}d comment`;
    if (type === "like") {
      likeCount = 1;
    } else {
      dislikeCount = 1;
    }
  }

  const cmt = await Comment.findByIdAndUpdate(
    cmtId,
    {
      $inc: { like: likeCount, dislike: dislikeCount },
    },
    { returnDocument: "after" },
  );

  if (cmt) {
    const commentAfterUpdate = await Comment.aggregate([
      {
        $match: { _id: cmt._id },
      },
      {
        $lookup: {
          from: "cmtreacts",
          let: {
            commentId: "$_id",
            userId: userId,
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          "react_info._id": { $ifNull: ["$react_info._id", null] },
          "react_info.type": { $ifNull: ["$react_info.type", null] },
          user_id: 1,
          like: 1,
          dislike: 1,
          replied_cmt_id: 1,
        },
      },
    ]);

    let type = "NORMAL";
    if (commentAfterUpdate[0]?.replied_cmt_id) {
      type = "REPLY";
    }

    emitEvent(`update-comment-${userId}`, {
      data: commentAfterUpdate[0],
      type,
    });

    if (userId.toString() !== commentAfterUpdate[0].user_id.toString()) {
      sendRealTimeNotification({
        senderId: userId,
        receiverId: commentAfterUpdate[0].user_id,
        type: "comment",
        cmtId: cmtId,
        message: `${name} has reacted to your comment`,
      });
    }
  }

  res.status(StatusCodes.OK).json({ msg });
};

module.exports = {
  toggleCmtReact,
};
