const mongoose = require("mongoose");

const { NotFoundError } = require("../errors");

const Comment = new mongoose.Schema(
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
Comment.pre("save", async function () {
  const session = this.$session();

  try {
    const Video = mongoose.model("Video");
    const video = await Video.updateOne(
      { _id: this.video_id.toString() },
      { $inc: { totalCmt: 1 } },
      { session },
    );

    if (video.matchedCount === 0) {
      throw new NotFoundError(`Not found video with id ${req.body.videoId}`);
    }
  } catch (error) {
    throw error;
  }
});

// Cascade delete and update when delete comment
Comment.pre(["deleteOne", "findOneAndDelete"], async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const { _id } = this.getQuery();
  const Comment = mongoose.model("Comment");
  const Video = mongoose.model("Video");
  const CmtReact = mongoose.model("CmtReact");

  try {
    const cmt = await Comment.findOne({ _id: _id });

    // Update videos total comments
    await Video.updateOne(
      { _id: cmt.video_id },
      { $inc: { totalCmt: -1 } },
      { session },
    );

    // Delete comment reacts
    if (cmt.like > 0 || cmt.dislike > 0) {
      await CmtReact.deleteMany({ cmt_id: cmt._id }, { session });
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
        await Comment.deleteMany(filter, { session });
      }
    } // Update root comments reply count when the deleted comment is not root comment
    else if (cmt.replied_parent_cmt_id) {
      await Comment.updateOne(
        { _id: cmt.replied_parent_cmt_id },
        { $inc: { replied_cmt_total: -1 } },
      );
    } else if (cmt.replied_cmt_id) {
      await Comment.updateOne(
        { _id: cmt.replied_cmt_id },
        { $inc: { replied_cmt_total: -1 } },
      );
    }
  } catch (error) {
    throw error;
  }
});

// Cascade delete and update when delete user or video

Comment.pre("deleteMany", async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const Comment = mongoose.model("Comment");
  const Video = mongoose.model("Video");
  const CmtReact = mongoose.model("CmtReact");
  const { user_id, video_id, $or, _id } = this.getQuery();
  let idList;
  if (_id) {
    idList = _id["$in"];
  }
  try {
    const findObj = {};

    if (user_id && !video_id) {
      findObj.user_id = user_id;
    } else if (video_id && !user_id) {
      if ($or) {
        findObj.video_id = video_id;
        findObj["$or"] = $or;
      } else {
        findObj.video_id = video_id;
      }
    } else if (_id) {
      findObj._id = { $in: idList };
    }

    const foundedCmts = await Comment.find(findObj);

    const cmtHaveReactList = foundedCmts
      .filter((cmt) => cmt.like > 0 || cmt.dislike > 0)
      .map((cmt) => cmt._id);

    await CmtReact.deleteMany(
      { cmt_id: { $in: cmtHaveReactList } },
      { session },
    );

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

    // Cascade when deleting user
    if (user_id) {
      for (const cmt of foundedCmts) {
        // Check if comment is comment root
        if (cmt.replied_cmt_total > 0) {
          // Find all the comments that replying in the comment root tree but not the comment was created by this user
          const filter = {
            video_id: cmt.video_id,
            $or: [
              { replied_cmt_id: cmt._id },
              { replied_parent_cmt_id: cmt._id },
            ],
            user_id: { $ne: user_id },
          };

          const dltCmtList = await Comment.find(filter, { session });

          if (dltCmtList.length > 0) {
            // Delete all the founded comments
            await Comment.deleteMany(filter, { session });

            const availableCmts = await Comment.find(
              {
                video_id: cmt.video_id,
              },
              { session },
            );

            // Update Video total comment
            await Video.findOneAndUpdate(
              { _id: cmt.video_id },
              { totalCmt: availableCmts.length },
              { session },
            );

            // delete all the react belong to the founded comments that have been deleted
            dltCmtList.forEach(async (item) => {
              if (item.like > 0 || item.dislike > 0) {
                await CmtReact.deleteMany({ cmt_id: item._id }, { session });
              }
            });
          }
        } // Update root comments reply count when the deleted comment is not root comment
        else if (cmt.replied_parent_cmt_id) {
          await Comment.updateOne(
            { _id: cmt.replied_parent_cmt_id },
            { $inc: { replied_cmt_total: -1 } },
            { session },
          );
        } else if (cmt.replied_cmt_id) {
          await Comment.updateOne(
            { _id: cmt.replied_cmt_id },
            { $inc: { replied_cmt_total: -1 } },
            { session },
          );
        }
      }
    }

    // Cascade when deleting list of comments 

    if(_id){
     
    }

  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("Comment", Comment);
