const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user ID"],
    },
    video_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide video ID"],
    },
    replied_user_id: {
      type: mongoose.Types.ObjectId,
    },
    replied_cmt_id: {
      type: mongoose.Types.ObjectId,
    },
    replied_parent_cmt_id: {
      type: mongoose.Types.ObjectId,
    },
    replied_cmt_total: {
      type: Number,
      default: 0,
    },
    cmtText: {
      type: String,
      min: 1,
      max: 255,
      required: [true, "Please provide comment text"],
    },
    like: {
      type: Number,
      default: 0,
    },
    dislike: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Update links data when user create comment
CommentSchema.pre("save", async function () {
  const session = this.$session();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  try {
    const Video = mongoose.model("Video");
    const Comment = mongoose.model("Comment");

    await Video.updateOne(
      { _id: this.video_id.toString() },
      { $inc: { totalCmt: 1 } },
      { session },
    );

    if (this.replied_parent_cmt_id) {
      await Comment.updateOne(
        { _id: this.replied_parent_cmt_id },
        { $inc: { replied_cmt_total: 1 } },
        { session },
      );
    }
  } catch (error) {
    throw error;
  }
});

// Cascade delete and update when delete comment
CommentSchema.pre(["deleteOne", "findOneAndDelete"], async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  // const { _id } = this.getQuery();
  const { foundedCmt } = this.getOptions().context;
  const Comment = mongoose.model("Comment");
  const Video = mongoose.model("Video");
  const CmtReact = mongoose.model("CmtReact");

  // Update videos total comments
  await Video.updateOne(
    { _id: foundedCmt.video_id },
    { $inc: { totalCmt: -1 } },
    { session },
  );

  // Delete comment reacts
  if (foundedCmt.like > 0 || foundedCmt.dislike > 0) {
    await CmtReact.deleteMany({ cmt_id: foundedCmt._id }, { session });
  }

  // Check if comment is comment root
  if (foundedCmt.replied_cmt_total > 0) {
    // Delete all the founded comments
    await Comment.deleteMany(
      {
        video_id: foundedCmt.video_id,
        replied_parent_cmt_id: foundedCmt._id,
      },
      { session },
    );
  } // Update root comments reply count when the deleted comment is not root comment
  else {
    await Comment.updateOne(
      {
        _id: foundedCmt.replied_parent_cmt_id
          ? foundedCmt.replied_parent_cmt_id
          : foundedCmt.replied_cmt_id,
      },
      { $inc: { replied_cmt_total: -1 } },
      { session },
    );
  }
});

// Cascade delete and update when delete user or video

CommentSchema.pre("deleteMany", async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const Comment = mongoose.model("Comment");
  const Video = mongoose.model("Video");
  const CmtReact = mongoose.model("CmtReact");

  const { user_id, video_id, replied_parent_cmt_id, _id } = this.getQuery();

  let foundedCmts;

  if (user_id) {
    // Filtering all the comments for cascade delete when deleting a user
    foundedCmts = await Comment.find({ user_id: user_id }).session(session);
  } else if (video_id) {
    const queriesObj = {};
    if (replied_parent_cmt_id) {
      // Filtering all comments that are replies to the root comment and cascade-deleting all of them.
      queriesObj.video_id = video_id;
      queriesObj["replied_parent_cmt_id"] = replied_parent_cmt_id;
    } else {
      // Filtering all the comments for cascade deleting when deleting a video
      queriesObj.video_id = video_id;
    }

    foundedCmts = await Comment.find(queriesObj).session(session);
  } else {
    const context = this.getOptions().context;
    foundedCmts = context.foundedCmts;
  }

  // Filtering all the comments that have comment react
  const cmtHaveReactList = foundedCmts
    .filter((cmt) => cmt.like > 0 || cmt.dislike > 0)
    .map((cmt) => cmt._id);

  // Cascade delete for comment react if it exists
  if (cmtHaveReactList.length > 0) {
    await CmtReact.deleteMany(
      { cmt_id: { $in: cmtHaveReactList } },
      { session },
    );
  }

  // bulkwrite to update video totalCmt after deleting comment
  //Do not execute when deleting a video, because if you are deleting the video,
  // you need to delete all the comments on it, and there is no need to update the total comment count.
  if ((video_id && replied_parent_cmt_id) || user_id || _id) {
    const videoCmtCount = foundedCmts.reduce((acc, cmt) => {
      const videoId = cmt.video_id.toString();
      acc[videoId] = (acc[videoId] || 0) + 1;
      return acc;
    }, {});

    const bulkOps = Object.entries(videoCmtCount).map(([videoId, count]) => ({
      updateOne: {
        filter: { _id: videoId },
        update: { $inc: { totalCmt: -count } },
      },
    }));
    await Video.bulkWrite(bulkOps, { session });
  }

  // Cascade delete when deleting user or deleting list of specific comment
  // Do not exec when deleting a video
  if (!video_id) {
    const bulkOps = [];
    for (const cmt of foundedCmts) {
      // Check if comment is comment root
      if (cmt.replied_cmt_total > 0) {
        // Find all comments that are replies in the comment root tree but were not created by this user.
        const filter = {
          video_id: cmt.video_id,
          replied_parent_cmt_id: cmt._id,
        };

        if (user_id) {
          filter["user_id"] = { $ne: user_id };
        }

        // Delete all the founded comments
        await Comment.deleteMany(filter, { session });
      } // Update root comments reply count when the deleted comment is not root comment
      else if (cmt.replied_parent_cmt_id) {
        bulkOps.push({
          updateOne: {
            filter: { _id: cmt.replied_parent_cmt_id },
            update: { $inc: { replied_cmt_total: -1 } },
          },
        });
      } else if (cmt.replied_cmt_id) {
        bulkOps.push({
          updateOne: {
            filter: { _id: cmt.replied_cmt_id },
            update: { $inc: { replied_cmt_total: -1 } },
          },
        });
      }
    }

    await Comment.bulkWrite(bulkOps, { session });
  }
});

module.exports = mongoose.model("Comment", CommentSchema);
