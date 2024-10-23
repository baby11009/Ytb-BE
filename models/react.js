const mongoose = require("mongoose");

const ReactSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user ID"],
    },
    video_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide video ID"],
    },
    type: {
      type: String,
      required: [true, "Please provide react type"],
      enum: ["like", "dislike"],
    },
  },
  { timestamps: true }
);

ReactSchema.pre("deleteMany", async function () {
  const { user_id } = this.getQuery();
  // Just do all of the work when it is cascade deleting when deleting user
  if (user_id) {
    const React = mongoose.model("React");
    const Video = mongoose.model("Video");
    const foundedReacts = await React.find({ user_id });

    foundedReacts.forEach(async (react) => {
      let updateObject = { $inc: { like: -1 } };
      if (react.type === "dislike") {
        updateObject = { $inc: { dislike: -1 } };
      }
      await Video.updateOne({ _id: react.video_id }, updateObject);
    });
  }
});

module.exports = mongoose.model("React", ReactSchema);
