const mongoose = require("mongoose");

const CmtSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user ID"],
    },
    video_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide video ID"],
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
  }
);

// Cascade delete and update when delete comment
CmtSchema.pre("deleteOne", async function (next) {
  const { _id } = this.getQuery();

  const Comment = mongoose.model("Comment");

  const Video = mongoose.model("Video");

  const CmtReact = mongoose.model("CmtReact");

  const cmt = await Comment.findOne({ _id: _id });

  // Update videos total comments
  await Video.updateOne({ _id: cmt.video_id }, { $inc: { totalCmt: -1 } });

  // Delete comment reacts
  if (cmt.like > 0 || cmt.dislike > 0) {
    await CmtReact.deleteMany({ cmt_id: cmt._id });
  }

  // Check if comment is comment root
  if (cmt.replied_cmt_total > 0) {
    const filter = {
      video_id: cmt.video_id,
      $or: [{ replied_cmt_id: cmt._id }, { replied_parent_cmt_id: cmt._id }],
    };

    // Find all the comments that replying in the comment root tree
    const dltCmtList = await Comment.find(filter);

    if (dltCmtList.length > 0) {
      // Delete all the founded comments
      await Comment.deleteMany(filter);

      const qtt = dltCmtList.length;

      // Update Video total comment
      await Video.findOneAndUpdate(
        { _id: cmt.video_id },
        { $inc: { totalCmt: -qtt } }
      );

      // delete all the react belong to the founded comments that have been deleted
      dltCmtList.forEach(async (item) => {
        if (item.like > 0 || item.dislike > 0) {
          await CmtReact.deleteMany({ cmt_id: item._id });
        }
      });
    }
  } // Update root comments reply count when the deleted comment is not root comment
  else if (cmt.replied_parent_cmt_id) {
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
});

// Cascade delete and update when delete user or video

CmtSchema.pre("deleteMany", async function () {
  const { user_id, video_id } = this.getQuery();

  const Comment = mongoose.model("Comment");
  const CmtReact = mongoose.model("CmtReact");
  const Video = mongoose.model("Video");
  const findObj = {};

  if (user_id && !video_id) {
    findObj.user_id = user_id;
  } else if (video_id && !user_id) {
    findObj.video_id = video_id;
  }

  const foundedCmts = await Comment.find(findObj);

  // Xóa các CmtReact của Comment đã delete
  foundedCmts.forEach(async (cmt) => {
    if (cmt.like > 0 || cmt.dislike > 0) {
      await CmtReact.deleteMany({ cmt_id: cmt._id });
    }
    await Video.updateOne({ _id: cmt.video_id }, { $inc: { totalCmt: -1 } });
    if (user_id) {
      // Check if comment is comment root
      if (cmt.replied_cmt_total > 0) {
        const filter = {
          video_id: cmt.video_id,
          $or: [
            { replied_cmt_id: cmt._id },
            { replied_parent_cmt_id: cmt._id },
          ],
        };

        // Find all the comments that replying in the comment root tree but not the comment was created by this user
        const dltCmtList = (await Comment.find(filter)).filter((cmt) => {
          if (cmt.user_id.toString() !== user_id.toString()) {
            return cmt;
          }
        });

        if (dltCmtList.length > 0) {
          // Delete all the founded comments
          await Comment.deleteMany(filter);

          const availableCmts = await Comment.find({ video_id: cmt.video_id });

          const qtt = dltCmtList.length;

          // Update Video total comment
          await Video.findOneAndUpdate(
            { _id: cmt.video_id },
            { $inc: { totalCmt: availableCmts.length } }
          );

          // delete all the react belong to the founded comments that have been deleted
          dltCmtList.forEach(async (item) => {
            if (item.like > 0 || item.dislike > 0) {
              await CmtReact.deleteMany({ cmt_id: item._id });
            }
          });
        }
      } // Update root comments reply count when the deleted comment is not root comment
      else if (cmt.replied_parent_cmt_id) {
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
    }
  });
});

module.exports = mongoose.model("Comment", CmtSchema);
