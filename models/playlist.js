const mongoose = require("mongoose");
const { NotFoundError } = require("../errors");

const PlaylistSchema = new mongoose.Schema(
  {
    created_user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    title: {
      type: String,
      minLength: 1,
      maxLength: 200,
      set: function (value) {
        switch (this.type) {
          case "watch_later":
            return "Watch Later";
          case "liked":
            return "Liked videos";
          case "history":
            return "History";
          default:
            if (!value) {
              throw new Error('Title is required when type is "playlist"');
            }

            return value;
        }
      },
    },
    itemList: {
      type: Array,
      default: [],
    },
    type: {
      type: String,
      enum: {
        values: ["playlist", "watch_later", "liked"],
        message: "${VALUE} is not supported",
      },
      default: "playlist",
    },
    privacy: {
      type: String,
      enum: {
        values: ["private", "public"],
        message: "privacy not suppoting {VALUE}",
      },
      required: function () {
        return this.type === "playlist";
      },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Playlist", PlaylistSchema);
