const { CmtReact, Comment } = require("../../models");
const { BadRequestError, NotFoundError } = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const cmtReact = require("../../models/cmtReact");

const toggleCmtReact = async (req, res) => {
  const { userId } = req.user;
  const { cmtId, type } = req.body;

  if (!cmtId) {
    throw new BadRequestError("Please provide comment id");
  }

  if (!type) {
    throw new BadRequestError("Please provide comment's react type");
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
      await CmtReact.findOneAndUpdate(
        { _id: exitsingCmtReact._id },
        { type: type }
      );
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

  const cmt = await Comment.findByIdAndUpdate(cmtId, {
    $inc: { like: likeCount, dislike: dislikeCount },
  });

  res.status(StatusCodes.OK).json({ msg });
};

module.exports = {
  toggleCmtReact,
};
