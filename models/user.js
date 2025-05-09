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
      maxLength: 30,
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
    totalView: {
      type: Number,
      default: 0,
    },
    totalLikes: {
      type: Number,
      default: 0,
    },
    totalDislikes: {
      type: Number,
      default: 0,
    },
    totalComments: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: "",
      maxLength: 5000,
    },
    notReadedNotiCount: {
      type: Number,
      default: 0,
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

    await Playlist.bulkWrite(
      [
        {
          insertOne: {
            document: {
              title: "Watch later",
              created_user_id: this._id,
              type: "watch_later",
            },
          },
        },
        {
          insertOne: {
            document: {
              title: "History",
              created_user_id: this._id,
              type: "history",
            },
          },
        },
        {
          insertOne: {
            document: {
              title: "Liked videos",
              created_user_id: this._id,
              type: "liked",
            },
          },
        },
      ],
      { session },
    );
  } catch (error) {
    throw error;
  }
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

    // Delete all the video that user have uploaded
    const videoCount = await Video.countDocuments(
      { user_id: foundedUser._id },
      { session },
    );

    if (videoCount > 0) {
      await Video.deleteMany({ user_id: foundedUser._id }, { session });
    }

    // Delete all the subcription that user has subscribed to other user channel
    const userSubscriptionCount = await Subscribe.countDocuments(
      { subscriber_id: foundedUser._id },
      { session },
    );

    if (userSubscriptionCount > 0) {
      await Subscribe.deleteMany(
        { subscriber_id: foundedUser._id },
        { session },
      );
    }

    // Delete all user channel subscriptions
    const subscriberCount = await Subscribe.countDocuments(
      { channel_id: foundedUser._id },
      { session },
    );

    if (subscriberCount) {
      await Subscribe.deleteMany({ channel_id: foundedUser._id }, { session });
    }

    // Delete all the react that user has created
    const reactCount = await React.countDocuments(
      { user_id: foundedUser._id },
      { session },
    );
    if (reactCount > 0) {
      await React.deleteMany(
        { user_id: foundedUser._id },
        { session, isDeletedUser: true },
      );
    }

    // Delete all the playlist user has created
    await Playlist.deleteMany(
      { created_user_id: foundedUser._id },
      { session },
    );

    // Delete all the comment that user has posted
    const commentCount = await Comment.countDocuments(
      { user_id: foundedUser._id },
      { session },
    );
    if (commentCount > 0) {
      await Comment.deleteMany({ user_id: foundedUser._id }, { session });
    }

    // Delete all the comment react that user has created
    const cmtReactCount = await CmtReact.countDocuments(
      { user_id: foundedUser._id },
      { session },
    );

    if (cmtReactCount > 0) {
      await CmtReact.deleteMany({ user_id: foundedUser._id }, { session });
    }

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
  const { session } = this.getOptions();
  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }

  const filter = this.getFilter();
  const deleteIdList = filter._id["$in"];

  const Video = mongoose.model("Video");
  const Playlist = mongoose.model("Playlist");
  const Comment = mongoose.model("Comment");
  const React = mongoose.model("React");
  const Subscribe = mongoose.model("Subscribe");
  const CmtReact = mongoose.model("CmtReact");

  for (const id of deleteIdList) {
    // Delete all the video that user has uploaded
    const videoCount = await Video.countDocuments({ user_id: id }, { session });

    if (videoCount > 0) {
      await Video.deleteMany({ user_id: id }, { session });
    }

    // Delete all the react that user has created
    const reactCount = await React.countDocuments({ user_id: id }, { session });
    if (reactCount > 0) {
      await React.deleteMany({ user_id: id }, { session });
    }

    // Delete all the comment that user has posted
    const commentCount = await Comment.countDocuments(
      { user_id: id },
      { session },
    );

    if (commentCount > 0) {
      await Comment.deleteMany({ user_id: id }, { session });
    }

    // Delete all the comment react that user has created
    const cmtReactCount = await CmtReact.countDocuments(
      { user_id: id },
      { session },
    );
    if (cmtReactCount > 0) {
      await CmtReact.deleteMany({ user_id: id }, { session });
    }

    // Delete all the subcription that user has subscribed to other user channel
    const supscriptionsCount = await Subscribe.countDocuments(
      { subscriber_id: id },
      { session },
    );

    if (supscriptionsCount > 0) {
      await Subscribe.deleteMany({ subscriber_id: id }, { session });
    }

    // Delete all user channel subscriptions
    const subscriberCount = await Subscribe.countDocuments(
      { channel_id: id },
      { session },
    );
    if (subscriberCount > 0) {
      await Subscribe.deleteMany({ channel_id: id }, { session });
    }

    await Playlist.deleteMany({ created_user_id: id }, { session });
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
