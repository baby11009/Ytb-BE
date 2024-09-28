const mongoose = require("mongoose");

const React = new mongoose.Schema({
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
});

module.exports = mongoose.model("React", React);
