const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
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
    playlistList: {
      type: mongoose.Types.ObjectId,
    },
    watchedHistory: {
      type: mongoose.Types.ObjectId,
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.pre(
  ["update", "updateOne", "findOneAndUpdate"],
  async function (next) {
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
  }
);

UserSchema.methods.createJwt = function () {
  return jwt.sign(
    {
      userId: this._id,
      username: this.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_LIFETIME,
    }
  );
};

UserSchema.methods.comparePassword = async function (candidatePw) {
  const isMatch = await bcrypt.compare(candidatePw, this.password);

  return isMatch;
};

UserSchema.methods.getName = function () {
  return this.name;
};

UserSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

module.exports = mongoose.model("User", UserSchema);
