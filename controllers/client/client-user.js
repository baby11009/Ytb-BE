const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const mongoose = require("mongoose");
const { Subscribe, User } = require("../../models");
const avatarPath = path.join(__dirname, "../../assets/user avatar");
const videoThumbPath = path.join(__dirname, "../../assets/video thumb");
const videoPath = path.join(__dirname, "../../assets/videos");

const getAccountInfo = async (req, res) => {
  const id = req.user.userId;

  const user = await User.findById(id).select(
    "-password -codeExpires -codeType -privateCode -updatedAt -__v"
  );

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
  const id = req.user.userId;
  const { ...data } = req.body;

  try {
    const dataFields = Object.keys(data);

    if (dataFields.length === 0 && !req.files) {
      throw new BadRequestError("No data provided to update");
    }

    const foundedUser = await User.findOne({ _id: id }).select(
      "name password role confirmed subscriber totalVids banner avatar description"
    );

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const validateFields = ["name", "password", "description"];

    const notValidateFields = [];

    const finalObject = {};

    const sameValueFields = [];

    for (const field of dataFields) {
      if (!validateFields.includes(field)) {
        notValidateFields.push(field);
        continue;
      }

      if (foundedUser[field] === data[field]) {
        sameValueFields.push(field);
        continue;
      }

      if (
        field === "password" &&
        (await foundedUser.comparePassword(data[field]))
      ) {
        sameValueFields.push(field);
      }

      finalObject[field] = data[field];
    }

    if (notValidateFields.length > 0) {
      throw new BadRequestError(
        `Not accepted theses fields: ${notValidateFields.join(", ")}`
      );
    }

    if (sameValueFields.length > 0) {
      throw new BadRequestError(
        `These fields's value is still the same: ${sameValueFields.join(", ")}`
      );
    }

    if (req.files?.image) {
      finalObject.avatar = req.files.image[0].filename;
    }

    if (req.files?.banner) {
      finalObject.banner = req.files.banner[0].filename;
    }


    await User.updateOne({ _id: id }, finalObject);

    if (foundedUser.avatar !== "df.jpg" && finalObject.avatar) {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg" && finalObject.banner) {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    res.status(StatusCodes.OK).json({ msg: "User updated successfully" });
  } catch (error) {
    if (req.files?.image) {
      deleteFile(req.files.image[0].path);
    }

    if (req.files?.banner) {
      deleteFile(req.files.banner[0].path);
    }
    throw error;
  }
};

module.exports = {
  getAccountInfo,
  getAccountSubscribedChannel,
  settingAccount,
};
