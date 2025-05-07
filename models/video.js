const mongoose = require("mongoose");
const User = require("./user");
const path = require("path");
const asssetPath = path.join(__dirname, "../assets");
const { clearUploadedVideoFiles } = require("../utils/clear");

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
    stream: {
      type: String,
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
    tags: {
      type: Array,
      default: [],
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
  },
);

// Update links data when create video
VideoSchema.pre("save", async function () {
  const { user_id } = this;

  const session = this.$session();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  await User.updateOne(
    { _id: user_id },
    { $inc: { totalVids: 1 } },
    { session },
  );
});

VideoSchema.pre(["updateOne", "findOneAndUpdate"], async function () {
  const { $inc, view } = this.getUpdate();
  const videoQuery = this.getQuery();

  if (($inc || view) && videoQuery.user_id) {
    const { session } = this.options;

    if (!session) {
      throw new Error("⚠️ Transaction session is required");
    }

    const User = mongoose.model("User");

    // if update by using admin api then must recalculate video view
    // base on new video view will recalculate user totalView
    const updateData = {
      $inc: { totalView: $inc ? $inc.view : view - videoQuery.view },
    };

    await User.updateOne({ _id: videoQuery.user_id }, updateData, { session });
  }
});

// Cascade when deleting video
VideoSchema.pre("deleteOne", async function () {
  const { session } = this.getOptions();

  const { foundedVideo } = this.getOptions().context;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const User = mongoose.model("User");

  const Comment = mongoose.model("Comment");

  const React = mongoose.model("React");

  const WathcedHistory = mongoose.model("WatchedHistory");

  await WathcedHistory.deleteMany({ video_id: foundedVideo._id }, { session });

  // Update user total uploaded video
  await User.updateOne(
    { _id: foundedVideo.user_id },
    { $inc: { totalVids: -1 } },
    { session },
  );

  // Delete all reacts that belong to this video
  await React.deleteMany({ video_id: foundedVideo._id }, { session });

  // Delete all comments that belong to this video
  const foundedCmt = await Comment.find({ video_id: foundedVideo._id }).session(
    session,
  );

  if (foundedCmt.length > 0) {
    await Comment.deleteMany({ video_id: foundedVideo._id }, { session });
  }

  // Delete video and thumbnail belong to this video

  const videoPath = path.join(asssetPath, "videos", foundedVideo.video);

  const imagePath = path.join(asssetPath, "video thumb", foundedVideo.thumb);
  let args = { videoPath, imagePath };

  if (foundedVideo?.stream) {
    args.streamFolderName = foundedVideo.stream;
  }

  await clearUploadedVideoFiles(args);
});

// Cascade when deleting user
VideoSchema.pre("deleteMany", async function () {
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const { user_id, _id } = this.getQuery();

  const Video = mongoose.model("Video");

  const Comment = mongoose.model("Comment");

  const React = mongoose.model("React");

  if (user_id || _id) {
    let foundedVideos = this.getOptions().context?.foundedVideos;

    if (user_id) {
      // Find all the videos is belong to user
      foundedVideos = await Video.find(matchObj)
        .select("_id user_id video thumb stream")
        .session(session);
    }
    const matchObj = user_id ? { user_id } : { _id };

    //An array that manages updating the total video count based on the number of deleted videos owned by the same user
    const userTotalVideoUpdates = {};

    // Deleting all the comments that belong to this video

    for (const video of foundedVideos) {
      if (_id) {
        userTotalVideoUpdates[video.user_id] =
          (userTotalVideoUpdates[video.user_id] || 0) + 1;
      }

      // Cascade delete for all related content
      const videoPath = path.join(asssetPath, "videos", video.video);
      const imagePath = path.join(asssetPath, "video thumb", video.thumb);
      let args = { videoPath, imagePath };
      if (video?.stream) {
        args.streamFolderName = video.stream;
      }

      await clearUploadedVideoFiles(args);

      // Delete all the React belong to videos
      const reactCount = await React.countDocuments(
        { video_id: video._id },
        { session },
      );
      if (reactCount > 0) {
        await React.deleteMany({ video_id: video._id }, { session });
      }

      // Delete all the comments belong to videos
      const commentCount = await Comment.countDocuments(
        { video_id: video._id },
        { session },
      );
      if (commentCount > 0) {
        await Comment.deleteMany({ video_id: video._id }, { session });
      }
    }

    if (_id) {
      const bulkOps = Object.entries(userTotalVideoUpdates).map(
        ([userId, totalVideoGotDeleted]) => ({
          updateOne: {
            filter: { _id: userId },
            update: {
              $inc: { totalVids: -totalVideoGotDeleted },
            },
          },
        }),
      );
      await User.bulkWrite(bulkOps, { session });
    }
  }
});

module.exports = mongoose.model("Video", VideoSchema);
