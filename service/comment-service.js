const { Comment, Video } = require("../models");
const { sessionWrap } = require("../utils/session");
const { NotFoundError } = require("../errors");
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

      if (replyCmt?.replied_parent_cmt_id) {
        cmtId = replyCmt?.replied_parent_cmt_id;
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

    return cmt;
  }
}

module.exports = new CommentService();
