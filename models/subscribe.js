const mongoose = require("mongoose");

const Subscribe = new mongoose.Schema(
  {
    subscriber_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    channel_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide channel id"],
    },
    notify: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Subscribe", Subscribe);
