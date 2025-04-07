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

Notification.post("save", async function () {
  const User = mongoose.model("User");

  await User.updateOne(
    { _id: this.userId },
    { notReadedNotiCount: { $inc: 1 } },
  );
});

Notification.pre(["updateOne", "findOneAndUpdate"], async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const { readed } = this.getUpdate();

  if (readed) {
    const { userId } = this.getQuery();

    const User = mongoose.model("User");
    await User.updateOne(
      { _id: userId },
      { notReadedNotiCount: { $inc: -1 } },
      { session },
    );
  }
});

module.exports = mongoose.model("Notification", Notification);
