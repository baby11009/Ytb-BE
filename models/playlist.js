const mongoose = require("mongoose");

const Playlist = new mongoose.Schema(
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
          case "playlist":
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
      enum: ["playlist", "watch_later", "liked", "history"],
      default: "playlist",
    },
    privacy: {
      type: String,
      enum: ["private", "public"],
      default: "public",
      required: function () {
        return this.type === "playlist"; // Chỉ bắt buộc nếu type là 'playlist'
      },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Playlist", Playlist);
