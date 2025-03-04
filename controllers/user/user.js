const {
  User,
  Video,
  Subscribe,
  React,
  Playlist,
  Comment,
  CmtReact,
} = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { deleteFile } = require("../../utils/file");
const mongoose = require("mongoose");
const path = require("path");

const avatarPath = path.join(__dirname, "../../assets/user avatar");
const createUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const keys = Object.keys(req.body);

    if (keys.length === 0) {
      throw new BadRequestError("Please provide data to create user");
    }

    const existingUser = await User.findOne({ email: req.body.email }).session(
      session,
    );

    if (existingUser) {
      throw new BadRequestError("Email already registered");
    }

    let finalData = { ...req.body };

    if (req.files.image && req.files.image[0]) {
      finalData.avatar = req.files.image[0].filename;
    }

    if (req.files.banner && req.files.banner[0]) {
      finalData.banner = req.files.banner[0].filename;
    }

    const user = await User.create([finalData], { session });
    await session.commitTransaction();
    res.status(StatusCodes.CREATED).json({ msg: user });
  } catch (error) {
    await session.abortTransaction();
    if (req.files.image) {
      deleteFile(req.files.image[0].path);
    }
    if (req.files.banner) {
      deleteFile(req.files.banner[0].path);
    }
    throw error;
  } finally {
    session.endSession();
  }
};

const getUsers = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const limitNumber = Number(limit) || 10;

  const pageNumber = Number(req.query.page) || 1;

  let skip = (pageNumber - 1) * limitNumber;

  const matchObj = {};

  const searchFuncsObj = {
    name: (name) => {
      matchObj.name = { $regex: name, $options: "i" };
    },
    email: (email) => {
      matchObj.email = { $regex: email, $options: "i" };
    },
    role: (role) => {
      matchObj.role = role;
    },
    confirmed: (confirmed) => {
      const valueList = { true: true, false: false };
      matchObj.confirmed = valueList[confirmed];
    },
  };

  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (searchFuncsObj[key]) {
        searchFuncsObj[key](value);
      }
    }
  }

  const sortObj = { createdAt: -1 };

  const sortFuncsObj = {
    createdAt: (value) => {
      const valueList = new Set(["1", "-1"]);
      if (valueList.has(value)) {
        sortObj.createdAt = Number(value);
      }
    },
  };

  if (sort) {
    for (const [key, value] of Object.entries(sort)) {
      if (sortFuncsObj[key]) {
        sortFuncsObj[key](value);
      }
    }
  }

  const pipeline = [
    {
      $match: matchObj,
    },
    {
      $project: {
        _id: 1,
        email: 1,
        name: 1,
        role: 1,
        confirmed: 1,
        subscriber: 1,
        avatar: 1,
        banner: { $ifNull: ["$banner", null] },
        totalVids: 1,
        createdAt: 1,
      },
    },
    {
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNumber }],
      },
    },
  ];

  let result = User.aggregate(pipeline);

  const users = await result;

  res.status(StatusCodes.OK).json({
    data: users[0]?.data,
    qtt: users[0]?.data?.length,
    totalQtt: users[0]?.totalCount[0]?.total,
    currPage: page,
    totalPages: Math.ceil(users[0]?.totalCount[0]?.total / limit),
  });
};

const getUserDetails = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide user id");
  }

  const user = await User.findById(id).select(
    "-password -subscriber -totalVids -codeType -privateCode -__v",
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(StatusCodes.OK).json({ data: user });
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide user id");
  }

  const foundedUser = await User.findById(id);

  if (!foundedUser) {
    throw new NotFoundError("User not found");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await User.deleteOne({ _id: id }, { session: session });

    await session.commitTransaction();
    // Delete user uploaded avatar and banner

    if (foundedUser.avatar !== "df.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    res.status(StatusCodes.OK).json({ msg: "User deleted" });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    throw new InternalServerError("Failed to delete user");
  } finally {
    session.endSession();
  }
};

const deleteManyUsers = async (req, res) => {
  
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of user's id to delete");
  }

  const idArray = idList.split(",");

  const foundedUsers = await User.find({ _id: { $in: idArray } }).select("_id");

  if (foundedUsers.length === 0) {
    throw new NotFoundError(`No user found with these ids ${idList}`);
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
  // Delete users after verify the id list is valid
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await User.deleteMany({ _id: { $in: idArray } }, { session });
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({
      msg: `Successfully deleted these following users : ${idList}`,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;

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
      "name password role confirmed subscriber totalVids banner avatar",
    );

    if (!foundedUser) {
      throw new NotFoundError("User not found");
    }

    const validateFields = [
      "name",
      "password",
      "role",
      "confirmed",
      "subscriber",
      "totalVids",
      "description",
    ];

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
        `Not accepted theses fields: ${notValidateFields.join(", ")}`,
      );
    }

    if (sameValueFields.length > 0) {
      throw new BadRequestError(
        `These fields's value is still the same: ${sameValueFields.join(", ")}`,
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

const testDlt = async (req, res) => {
  await User.deleteOne({ _id: 21321 });

  res.status(StatusCodes.OK).json({ msg: "OK" });
};
module.exports = {
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteManyUsers,
  updateUser,
  testDlt,
};
