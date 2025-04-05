const mongoose = require("mongoose");

const Notification = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: ["comment", "subscription", "content"],
      required: true,
    },
    readed: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      minLength: 5,
      maxLength: 255,
    },
  },
  {
    timestamps: true,
  },
);

Notification.index(["userId"]);

module.exports = mongoose.model("Notification", Notification);
