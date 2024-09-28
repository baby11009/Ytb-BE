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


module.exports = mongoose.model("Comment", CmtSchema);
