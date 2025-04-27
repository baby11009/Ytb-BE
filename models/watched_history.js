const mongoose = require("mongoose");

const WatchedHistorySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  video_id: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  video_type: {
    type: String,
    enum: ["video", "short"],
    required: true,
  },
  watched_duration: {
    type: Number,
    default: 0,
  },
  last_watched_at: {
    type: Date,
    default: Date.now,
  },
});

WatchedHistorySchema.index({ user_id: 1, video_id: 1 }, { unique: true });

module.exports = mongoose.model("WatchedHistory", WatchedHistorySchema);
