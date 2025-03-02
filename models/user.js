const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const path = require("path");
const avatarPath = path.join(__dirname, "../assets/user avatar");
const { deleteFile } = require("../utils/file.js");
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

User.pre("save", async function () {
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

User.post("save", async function () {
  const session = this.$session();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  try {
    const Playlist = mongoose.model("Playlist");

    await Playlist.create(
      [
        {
          created_user_id: this._id,
          type: "watch_later",
        },
      ],
      { session },
    );

    await Playlist.create(
      [
        {
          created_user_id: this._id,
          type: "history",
        },
      ],
      { session },
    );

    await Playlist.create(
      [
        {
          created_user_id: this._id,
          type: "liked",
        },
      ],
      { session },
    );
  } catch (error) {
    throw error;
  }
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
  const session = this.getOptions().session;

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  try {
    const User = mongoose.model("User");
    const Video = mongoose.model("Video");
    const Playlist = mongoose.model("Playlist");
    const Comment = mongoose.model("Comment");
    const React = mongoose.model("React");
    const Subscribe = mongoose.model("Subscribe");
    const CmtReact = mongoose.model("CmtReact");

    const foundedUser = await User.findById(_id)
      .session(session)
      .select("_id avatar banner");

    // find all the video that user had uploaded
    const foundedVideos = await Video.find({
      user_id: foundedUser._id,
    })
      .select("_id")
      .session(session);

    if (foundedVideos.length > 0) {
      // Delete all the video that user have uploaded
      await Video.deleteMany(
        { user_id: foundedUser._id },
        { session, isDeletedUser: true },
      );
    }

    const subscriptions = await Subscribe.find({
      subscriber_id: foundedUser._id,
    })
      .select("_id channel_id")
      .session(session);

    if (subscriptions.length > 0) {
      // Delete all the subcription that user has subscribed to other user channel
      await Subscribe.deleteMany(
        { subscriber_id: foundedUser._id },
        { session },
      );
    }

    const channelSubscriptions = await Subscribe.find({
      channel_id: foundedUser._id,
    })
      .select("_id")
      .session(session);

    if (channelSubscriptions.length > 0) {
      // Delete all user channel subscriptions
      await Subscribe.deleteMany({ channel_id: foundedUser._id }, { session });
    }

    // find all the react user had created
    const reacts = await React.find({ user_id: foundedUser._id })
      .select("_id")
      .session(session);

    if (reacts.length > 0) {
      // Delete all the react that user has created
      await React.deleteMany(
        { user_id: foundedUser._id },
        { session, isDeletedUser: true },
      );
    }

    const playlists = await Playlist.find({ created_user_id: foundedUser._id })
      .select("_id")
      .session(session);

    if (playlists.length > 0) {
      await Playlist.deleteMany(
        { created_user_id: foundedUser._id },
        { session },
      );
    }

    const comments = await Comment.find({ user_id: foundedUser._id })
      .select("_id")
      .session(session);

    if (comments.length > 0) {
      // Delete all the comment that user has posted
      await Comment.deleteMany(
        { user_id: foundedUser._id },
        { session, isDeletedUser: true },
      );
    }

    const cmtReacts = await CmtReact.find({ user_id: foundedUser._id })
      .select("_id")
      .session(session);

    if (cmtReacts.length > 0) {
      // Delete all the comment react that user has created
      await CmtReact.deleteMany(
        { user_id: foundedUser._id },
        { session, isDeletedUser: true },
      );
    }

    // await Promise.all(foundedCmtReacts.map((cmtReacts) => {}));

    // Deleting avatar file if user has uploaded
    if (foundedUser.avatar !== "df.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    // Deleting banner file if user has uploaded
    if (foundedUser.banner !== "df-banner.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }
  } catch (error) {
    throw error;
  }
});

User.pre("deleteMany", async function () {
  const session = this.getOptions().session;
  if (!session) {
    return next(new Error("⚠️ Transaction session is required"));
  }

  const filter = this.getFilter();
  const deleteIdList = filter._id["$in"];

  const User = mongoose.model("User");
  const Video = mongoose.model("Video");
  const Playlist = mongoose.model("Playlist");
  const Comment = mongoose.model("Comment");
  const React = mongoose.model("React");
  const Subscribe = mongoose.model("Subscribe");
  const CmtReact = mongoose.model("CmtReact");

  const foundedUsers = await User.find({ _id: { $in: deleteIdList } }).select(
    "_id avatar banner",
  );

  for (const id of deleteIdList) {
    await Video.deleteMany({ user_id: id }, { session });

    // Delete all the subcription that user has subscribed to other user channel
    await Subscribe.deleteMany({ subscriber_id: id }, { session });

    await Promise.all(
      channelSubscriptions.map((subscribe) =>
        User.updateOne(
          { _id: subscribe.channel_id },
          { $inc: { subscriber: -1 } },
          { session },
        ),
      ),
    );

    // Delete all user channel subscriptions
    await Subscribe.deleteMany({ channel_id: id }, { session });

    // Delete all the react that user has created
    await React.deleteMany({ user_id: id }, { session });

    await Playlist.deleteMany({ created_user_id: id }, { session });

    // Delete all the comment react that user has created
    await CmtReact.deleteMany({ user_id: id }, { session });

    await Promise.all(foundedCmtReacts.map((cmtReacts) => {}));

    // Delete all the comment that user has posted
    await Comment.deleteMany({ user_id: id }, { session });
  }
});

User.post("deleteMany", async function () {
  const filter = this.getFilter();
  const deleteIdList = filter._id["$in"];
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
