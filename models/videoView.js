const mongoose = require("mongoose");

const VideoViewSchema = new mongoose.Schema(
  {
    video_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    video_owner_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    viewer_id: {
      type: mongoose.Types.ObjectId,
    },
  },
  { timestamps: true },
);

VideoViewSchema.index("createdAt");

module.exports = mongoose.model("VideoView", VideoViewSchema);
