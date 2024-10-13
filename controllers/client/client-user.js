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

  const { email, ...data } = req.body;

  let foundedUser;

  try {
    if (email) {
      throw new BadRequestError("Cannot update user email address");
    }

    const dataFields = Object.keys(data);

    if (dataFields.length === 0 && !req.files) {
      throw new BadRequestError("No data provided to update");
    }

    foundedUser = await User.findOne({ _id: id }).select(
      "name password role confirmed subscriber totalVids banner avatar"
    );

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const validateFields = ["name", "password"];

    const notValidateFields = [];

    const finalObject = {};

    const sameValueFields = [];

    for (const field of dataFields) {
      if (!validateFields.includes(field)) {
        notValidateFields.push(field);
      } else {
        if (foundedUser[field] === data[field]) {
          sameValueFields.push(field);
        } else {
          if (
            field === "password" &&
            (await foundedUser.comparePassword(data[field]))
          ) {
            sameValueFields.push(field);
          } else {
            if (field === "confirmed") {
              let value =
                data[field] === "true"
                  ? true
                  : data[field] === "false"
                  ? false
                  : data[field];

              data[field] = value;
            }
            finalObject[field] = data[field];
          }
        }
      }
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

    const user = await User.updateOne({ _id: id }, finalObject);

    if (user.modifiedCount === 0) {
      throw new InternalServerError("Failed to update user");
    }

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
