const mongoose = require("mongoose");

const React = new mongoose.Schema(
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
  { timestamps: true },
);

React.pre("deleteMany", async function () {
  const { user_id } = this.getQuery();
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  // Just do all of the work when it is cascade deleting when deleting user

  try {
    const React = mongoose.model("React");
    const Video = mongoose.model("Video");
    // When deleting all the react user has created
    if (user_id) {
      const foundedReacts = await React.find({ user_id })
        .select("_id video_id type")
        .session(session);

      if (foundedReacts.length > 0) {
        const bulkOps = foundedReacts.map((react) => {
          let updateObject = { $inc: { like: -1 } };

          if (react.type === "dislike") {
            updateObject = { $inc: { dislike: -1 } };
          }

          return {
            updateOne: {
              filter: {
                _id: react.video_id,
              },
              update: updateObject,
            },
          };
        });

        await Video.bulkWrite(bulkOps, session);
      }

      // await Promise.all(
      //   foundedReacts.map((react) => {
      //     let updateObject = { $inc: { like: -1 } };

      //     if (react.type === "dislike") {
      //       updateObject = { $inc: { dislike: -1 } };
      //     }

      //     return Video.updateOne({ _id: react.video_id }, updateObject, {
      //       session,
      //     });
      //   }),
      // );
    }
  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("React", React);
