const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const path = require("path");
const avatarPath = path.join(__dirname, "../assets/user avatar");

const User = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide user name"],
      minLength: 1,
      maxLength: 15,
    },
    email: {
      type: String,
      required: [true, "Please provide email"],
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "Please provide a valid email",
      ],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please provide password"],
      minLength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    confirmed: {
      type: Boolean,
      default: false,
    },
    privateCode: {
      type: String,
      default: "12345",
    },
    codeType: {
      type: String,
      enum: ["verify", "forgot", "change-password"],
      default: "verify",
    },
    codeExpires: {
      type: Date,
    },
    avatar: {
      type: String,
      default: "df.jpg",
    },
    banner: {
      type: String,
      default: "df-banner.jpg",
    },
    subscriber: {
      type: Number,
      default: 0,
    },
    totalVids: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: "",
    },
    watchedHistory: {
      type: mongoose.Types.ObjectId,
    },
  },
  { timestamps: true },
);

User.pre("save", async function (next) {
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

User.post("save", async function (next) {
  const Playlist = mongoose.model("Playlist");

  await Playlist.create({
    created_user_id: this._id,
    type: "watch_later",
  });

  await Playlist.create({
    created_user_id: this._id,
    type: "history",
  });

  await Playlist.create({
    created_user_id: this._id,
    type: "liked",
  });
});

User.pre(["update", "updateOne", "findOneAndUpdate"], async function (next) {
  const update = this.getUpdate();
  if (update.password) {
    // Xác thực độ dài mật khẩu
    if (update.password.length < 6) {
      return next(new Error("Password must be at least 6 characters long"));
    }

    const salt = await bcrypt.genSalt(10);
    update.password = await bcrypt.hash(update.password, salt);
  }
  if (update.name) {
    if (update.name.length > 15) {
      return next(new Error("User name cannot exceed 15 characters"));
    }
  }
  next();
});

// Cascade when deleting user
User.pre("deleteOne", async function () {
  const { _id } = this.getQuery();
  const User = mongoose.model("User");
  const Video = mongoose.model("Video");
  const Playlist = mongoose.model("Playlist");
  const Comment = mongoose.model("Comment");
  const React = mongoose.model("React");
  const Subscribe = mongoose.model("Subscribe");
  const CmtReact = mongoose.model("CmtReact");

  const foundedUser = await User.findById(_id);

  // Deleting avatar file if user has uploaded
  if (foundedUser.avatar !== "df.jpg") {
    deleteFile(path.join(avatarPath, foundedUser.avatar));
  }

  // Deleting banner file if user has uploaded
  if (foundedUser.banner !== "df-banner.jpg") {
    deleteFile(path.join(avatarPath, foundedUser.banner));
  }

  // Finding all the video that user has uploaded
  const foundedVideo = await Video.find({ user_id: foundedUser._id });

  // If user has uploaded more than one video then deleting all the videos that have been founded
  if (foundedVideo.length > 0) {
    await Video.deleteMany({ user_id: foundedUser._id });
  }

  // Find all the subscriptions that user has subscribed to other channels
  const foundedSubscribes1 = await Subscribe.find({
    subscriber_id: foundedUser._id,
  });

  // If subscription is more than one than delete the subscription and update channel subscriber count
  if (foundedSubscribes1.length > 0) {
    await Subscribe.deleteMany({ subscriber_id: foundedUser._id });

    foundedSubscribes1.forEach(async (subscribe) => {
      await User.updateOne(
        { _id: subscribe.channel_id },
        { $inc: { subscriber: -1 } },
      );
    });
  }

  const foundedSubscribes2 = await React.find({ user_id: foundedUser._id });
  if (foundedSubscribes2.length > 0) {
    // Delete all the Subscribe that user has subscribed to user channel
    await Subscribe.deleteMany({ channel_id: foundedUser._id });
  }

  const foundedReacts = await React.find({ user_id: foundedUser._id });
  if (foundedReacts.length > 0) {
    // Delete all the react that user has created
    await React.deleteMany({ user_id: foundedUser._id });
  }

  // Check if user has created any comments
  const foundedComments = await Comment.find({ user_id: foundedUser._id });
  if (foundedComments.length > 0) {
    // Delete all the comment that user has created
    await Comment.deleteMany({ user_id: foundedUser._id });
  }

  const foundedPlaylists = await Playlist.find({
    created_user_id: foundedUser._id,
  });
  if (foundedPlaylists.length > 0) {
    // Delete all the playlist that user has created
    await Playlist.deleteMany({ created_user_id: foundedUser._id });
  }

  // Find all the comment react that user has created
  const foundedCmtReacts = await CmtReact.find({ user_id: foundedUser._id });
  if (foundedCmtReacts.length > 0) {
    // Delete all the comment react that user has created
    await CmtReact.deleteMany({ user_id: foundedUser._id });
  }
});

User.methods.createJwt = function () {
  return jwt.sign(
    {
      userId: this._id,
      username: this.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_LIFETIME,
    },
  );
};

User.methods.comparePassword = async function (candidatePw) {
  const isMatch = await bcrypt.compare(candidatePw, this.password);

  return isMatch;
};

User.methods.getName = function () {
  return this.name;
};

User.methods.isAdmin = function () {
  return this.role === "admin";
};

module.exports = mongoose.model("User", User);
