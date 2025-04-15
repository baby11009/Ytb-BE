const mongoose = require("mongoose");

const Notification = new mongoose.Schema(
  {
    sender_user_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    receiver_user_id: {
      type: mongoose.Types.ObjectId,
      required: true,
      validate: {
        validator: function (value) {
          return value.toString() !== this.sender_user_id.toString();
        },
        message: "Receiver cannot be the same as sender.",
      },
    },
    type: {
      type: String,
      enum: ["subscription", "comment", "react", "content"],
      required: true,
    },
    // must need video id to redirect user to video  when notification got clicked
    video_id: {
      type: mongoose.Types.ObjectId,
      validate: {
        validator: function (value) {
          // If notfification type is inside the required this you must provide video id
          const requiredType = ["react"];
          if (requiredType.includes(value)) {
            return !!value;
          }

          return true;
        },
        message:
          "Video ID is required when type is subscription, comment or react",
      },
    },
    // must need comment id to redirect user to video and get comment that related when notification got clicked
    comment_id: {
      type: mongoose.Types.ObjectId,
      validate: {
        validator: function (value) {
          // If notfification type is inside the required this you must provide comment id
          const requiredType = ["comment"];
          if (requiredType.includes(value)) {
            return !!value;
          }

          return true;
        },
        message: "Comment ID is required when type is comment",
      },
    },
    message: {
      type: String,
      required: true,
      minLength: 5,
      maxLength: 255,
    },
    readed: {
      type: Boolean,
      default: false,
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
    { _id: this.receiver_user_id },
    { $inc: { notReadedNotiCount: 1 } },
  );
});

Notification.pre(["updateOne", "findOneAndUpdate"], async function () {
  const { session } = this.options;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const { readed } = this.getUpdate();

  if (readed) {
    const { receiver_user_id } = this.getQuery();

    const User = mongoose.model("User");
    await User.updateOne(
      { _id: receiver_user_id },
      { $inc: { notReadedNotiCount: -1 } },
      { session },
    );
  }
});

module.exports = mongoose.model("Notification", Notification);
