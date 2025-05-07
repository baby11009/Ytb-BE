const { User } = require("../models");
const { deleteFile } = require("../utils/file");
const { sessionWrap } = require("../utils/session");
const { NotFoundError } = require("../errors");
const { UserValidator } = require("../utils/validate");

const path = require("path");
const avatarPath = path.join(__dirname, "../assets/user avatar");

class UserService {
  async insertSingleUser(data) {
    const user = await sessionWrap(async (session) => {
      const user = await User.create([data], { session });
      return user;
    });

    return user;
  }

  async getSingleUser(query, select) {
    const foundedUser = await User.findOne(query).select(select);
    return foundedUser;
  }

  async updateSingleUser(query, data, files, allowedFields) {
    const foundedUser = await User.findOne(query);

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const updateDatas = await new UserValidator(
      { ...data, ...files },
      foundedUser,
      allowedFields,
    ).getValidatedUpdateData();

    const user = await User.findOneAndUpdate(query, updateDatas, {
      new: true,
    }).select("name password description avatar banner");

    if (foundedUser.avatar !== "df.jpg" && updateDatas.avatar) {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg" && updateDatas.banner) {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    return user;
  }

  async deleteSingleUser(query) {
    const foundedUser = await User.findOne(query);

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    await sessionWrap(async (session) => {
      await User.deleteOne(query, { session });
    });

    // Delete user uploaded avatar and banner

    if (foundedUser && foundedUser.avatar !== "df.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser && foundedUser.banner !== "df-banner.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }
  }

  async deleteManyUser(idArray) {
    const foundedUsers = await User.find({ _id: { $in: idArray } }).select(
      "_id avatar banner",
    );

    if (foundedUsers.length === 0) {
      throw new NotFoundError(
        `No user found with these ids ${idArray.join(", ")}`,
      );
    } else if (foundedUsers.length !== idArray.length) {
      const notFoundedList = [];

      foundedUsers.forEach((user) => {
        if (idArray.includes(user._id.toString())) {
          notFoundedList.push(user._id);
        }
      });

      throw new NotFoundError(
        `No user found with these ids : ${notFoundedList.join(", ")}`,
      );
    }

    await sessionWrap(async (session) => {
      await User.deleteMany({ _id: { $in: idArray } }, { session }).setOptions({
        context: { foundedUsers },
      });
    });

    foundedUsers.forEach((foundedUser) => {
      // Deleting avatar file if user has uploaded
      if (foundedUser.avatar !== "df.jpg") {
        deleteFile(path.join(avatarPath, foundedUser.avatar));
      }

      // Deleting banner file if user has uploaded
      if (foundedUser.banner !== "df-banner.jpg") {
        deleteFile(path.join(avatarPath, foundedUser.banner));
      }
    });
  }
}

module.exports = new UserService();
