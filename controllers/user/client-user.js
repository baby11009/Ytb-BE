const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");
const User = require("../../models/user");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const mongoose = require("mongoose");
const { Subscribe } = require("../../models");

const asssetPath = path.join(__dirname, "../../assets");

const getAccountInfo = async (req, res) => {
  const id = req.user.userId;

  console.log("🚀 ~ id :", id);

  const user = await User.findById(id).select(
    "-password -codeExpires -codeType -privateCode -updatedAt -__v"
  );

  console.log("🚀 ~ user:", user);

  res.status(StatusCodes.OK).json({ data: user });
};

const getAccountSubscribedChannel = async (req, res) => {
  const id = req.user.userId;

  const pipline = [
    {
      $match: { subscriber_id: new mongoose.Types.ObjectId(id) },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel_id",
        foreignField: "_id",
        as: "channels_info",
      },
    },
    {
      $unwind: "$channels_info",
    },
    {
      $project: {
        notify: 1,
        channels_info: {
          _id: 1,
          avatar: 1,
          name: 1,
          email: 1,
        },
      },
    },
  ];

  const channels = await Subscribe.aggregate(pipline);

  res.status(StatusCodes.OK).json({
    data: {
      channels: channels,
      qtt: channels.length,
    },
  });
};

const settingAccount = async (req, res) => {
  const { id } = req.params;

  const userId = req.user.userId;

  if (id === "" || id === ":id") {
    throw new BadRequestError(`Please provide user id cannot be empty`);
  }

  if (userId !== id) {
    throw new BadRequestError(`Cannot modify user`);
  }

  if (Object.keys(req.body).length === 0 && !req.files.image) {
    throw new BadRequestError("There is nothing to update.");
  }

  const updatedKey = ["name", "password", "image"];

  let updateData = {};

  let emptyList = [];

  let notAllowValue = [];

  for (const [key, value] of Object.entries(req.body)) {
    if (updatedKey.includes(key)) {
      if (value === "") {
        emptyList.push(key);
      } else {
        updateData[key] = value;
      }
    } else {
      notAllowValue.push(key);
    }
  }

  if (notAllowValue.length > 0) {
    throw new BadRequestError(
      `The user cannot contain the following fields: ${notAllowValue.join(
        ", "
      )}`
    );
  }

  if (emptyList.length > 0) {
    throw new BadRequestError(`${emptyList.join(", ")} cannot be empty`);
  }

  if (req.files.image && req.files.image[0]) {
    updateData["avatar"] = req.files.image[0].filename;
  }

  const user = await User.findByIdAndUpdate(id, updateData);
  if (!user) {
    throw new BadRequestError(`No account with id ${id}`);
  }

  if (req.files.image && req.files.image[0]) {
    const imgPath = path.join(asssetPath, "user avatar", user.avatar);
    deleteFile(imgPath);
  }
  res.status(StatusCodes.OK).json({ msg: "Updated" });
};

module.exports = {
  getAccountInfo,
  getAccountSubscribedChannel,
  settingAccount,
};
