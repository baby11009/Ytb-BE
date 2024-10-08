const mongoose = require("mongoose");

const VideoSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    title: {
      type: String,
      required: [true, "Please provide video title"],
      minLength: 1,
      maxLength: 200,
    },
    video: {
      type: String,
      required: [true, "Please provide video"],
    },
    duration: {
      type: Number,
      required: [true, "Please provide video duration"],
    },
    thumb: {
      type: String,
      required: [true, "Please provide video thumbnail"],
    },
    type: {
      type: String,
      required: [true, "Please provide video type"],
      enum: ["video", "short"],
    },
    tag: {
      type: Array,
      required: [true, "Please provide video tag for video"],
    },
    view: {
      type: Number,
      default: 0,
      min: 0,
    },
    like: {
      type: Number,
      default: 0,
      min: 0,
    },
    dislike: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCmt: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);



module.exports = mongoose.model("Video", VideoSchema);
