const { Comment, Video } = require("../models");
const { sessionWrap } = require("../utils/session");
const {
  NotFoundError,
  BadRequestError,
  InternalServerError,
} = require("../errors");
const { CommentValidator } = require("../utils/validate");

class CommentService {
  async createComment(userId, commentData) {
    const { videoId, cmtText, replyId, like, dislike } = commentData;

    const video = await Video.findById(videoId);

    if (!video) {
      throw new NotFoundError(`Not found video with id ${videoId}`);
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

    if (like) {
      data.like = like;
    }

    if (dislike) {
      data.dislike = dislike;
    }

    const cmt = await sessionWrap(async (session) => {
      const cmt = await Comment.create([data], { session });
      return cmt;
    });

    return {
      replyCmt: replyCmt,
      comment: cmt[0],
    };
  }

  async updateComment(cmtId, additionalQueries, data, allowedFields) {
    const foundedCmt = await Comment.findOne({
      _id: cmtId,
      ...additionalQueries,
    });

    if (!foundedCmt) {
      throw new NotFoundError(`Not found comment with id ${id}`);
    }

    const updateDatas = new CommentValidator(
      data,
      foundedCmt,
      allowedFields,
    ).getValidatedUpdateData();

    const cmt = await Comment.findOneAndUpdate({ _id: cmtId }, updateDatas, {
      returnDocument: "after",
    });

    if (!cmt) {
      throw new InternalServerError(`Failed to update comment`);
    }

    return cmt;
  }

  async deleteComment(cmtId, authUser) {
    let foundedCmt;

    const basedOnRoleActions = {
      user: async () => {
        foundedCmt = await Comment.aggregate([
          {
            $set: {
              _idStr: { $toString: "$_id" },
            },
          },
          { $match: { _idStr: cmtId } },
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
          (foundedCmt[0].user_id.toString() !== authUser.userId.toString() &&
            foundedCmt[0].video_info.user_id.toString() !==
              authUser.userId.toString())
        ) {
          throw new NotFoundError(`Not found comment with id ${cmtId}`);
        }
        foundedCmt = foundedCmt[0];
      },
      admin: async () => {
        foundedCmt = await Comment.findById(cmtId);

        if (!foundedCmt) {
          throw new NotFoundError(`Cannot find comment with id ${cmtId}`);
        }
      },
    };

    await basedOnRoleActions[authUser.role]();

    await sessionWrap(async (session) => {
      await Comment.deleteOne({ _id: cmtId }, { session }).setOptions({
        context: { foundedCmt: foundedCmt },
      });
    });

    return foundedCmt;
  }

  async deleteManyComment(idArray, additionalQueries) {
    const foundedCmts = await Comment.find({
      ...additionalQueries,
      _id: { $in: idArray },
    }).select("-cmtText");
    if (foundedCmts.length < 1) {
      throw new BadRequestError(
        `Not found comments with id : ${idArray.join(", ")}`,
      );
    }

    const requestedIdSet = new Set(idArray);

    const foundedCmtIdList = new Set();

    const cmtListNeedToDelete = [];

    for (const cmt of foundedCmts) {
      //Remove reply comment ID if the root comment is included in the list,
      //  because in cascade deletion, the entire comment tree will be deleted if the root comment got removed.
      if (
        !cmt.replied_parent_cmt_id ||
        !requestedIdSet.has(cmt.replied_parent_cmt_id)
      ) {
        cmtListNeedToDelete.push(cmt._id);
      }

      foundedCmtIdList.add(cmt._id.toString());
    }
    console.log("🚀 ~ cmtListNeedToDelete:", cmtListNeedToDelete);

    const notFoundedCmts = idArray.filter((id) => !foundedCmtIdList.has(id));

    if (notFoundedCmts.length > 0) {
      throw new BadRequestError(
        `Not found comments with id : ${notFoundedCmts.join(", ")}`,
      );
    }

    await sessionWrap(async (session) => {
      await Comment.deleteMany(
        { _id: { $in: cmtListNeedToDelete } },
        { session },
      ).setOptions({ context: { foundedCmts } });
    });
  }
}

module.exports = new CommentService();
