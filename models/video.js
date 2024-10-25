const mongoose = require("mongoose");
const User = require("./user");
const path = require("path");
const asssetPath = path.join(__dirname, "../assets");
const { deleteFile } = require("../utils/file");
const user = require("./user");

const Video = new mongoose.Schema(
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
    description: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Update links data when create video
Video.pre("save", async function () {
  const { user_id } = this;
  await User.updateOne({ _id: user_id }, { $inc: { totalVids: 1 } });
});

// Cascade when deleting video
Video.pre("deleteOne", async function () {
  const { _id } = this.getQuery();

  const Video = mongoose.model("Video");

  const User = mongoose.model("User");

  const Comment = mongoose.model("Comment");

  const React = mongoose.model("React");

  const video = await Video.findOne({ _id: _id });

  // Delete video and thumbnail belong to this video
  const videoPath = path.join(asssetPath, "videos", video.video);
  deleteFile(videoPath);

  const thumbPath = path.join(asssetPath, "video thumb", video.thumb);
  deleteFile(thumbPath);

  // Update user total uploaded video
  await User.updateOne({ _id: video.user_id }, { $inc: { totalVids: -1 } });

  // Delete all reacts that belong to this video
  await React.deleteMany({ video_id: _id });

  // Delete all comments that belong to this video
  const foundedCmt = await Comment.find({ video_id: _id });

  if (foundedCmt.length > 0) {
    await Comment.deleteMany({ video_id: _id });
  }
});

// Cascade when deleting user
Video.pre("deleteMany", async function () {
  const { user_id } = this.getQuery();

  const Video = mongoose.model("Video");

  const Comment = mongoose.model("Comment");

  const React = mongoose.model("React");

  // Find all the videos is belong to user
  const foundedVideos = await Video.find({ user_id });

  // Deleting all the comments that belong to this video
  foundedVideos.map(async (video) => {
    // Delete video and thumbnail belong to this video
    const imgPath = path.join(asssetPath, "video thumb", video.thumb);
    deleteFile(imgPath);
    const videoPath = path.join(asssetPath, "videos", video.video);
    deleteFile(videoPath);

    // Delete all the React belong to videos
    await React.deleteMany({ video_id: video._id });
    // Delete all the comments belong to videos
    await Comment.deleteMany({ video_id: video._id });
  });
});
module.exports = mongoose.model("Video", Video);
