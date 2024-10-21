const mongoose = require("mongoose");

const Playlist = new mongoose.Schema(
  {
    created_user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    title: {
      type: String,
      required: [true, "Please provide playlist title"],
      minLength: 1,
      maxLength: 200,
    },
    itemList: {
      type: Array,
      default: [],
    },
    type: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Playlist", Playlist);
