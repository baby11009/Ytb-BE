const { User } = require("../../models");
const {
  BadRequestError,
  NotFoundError,
  InvalidError,
} = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { deleteFile } = require("../../utils/file");
const { searchWithRegex, isObjectEmpty } = require("../../utils/other");
const { Validator } = require("../../utils/validate");
const {
  insertSingleUser,
  getSingleUser,
  updateSingleUser,
  deleteSingleUser,
  deleteManyUser,
} = require("../../service/user-service");

const createUser = async (req, res) => {
  try {
    const keys = Object.keys(req.body);

    if (keys.length === 0) {
      throw new BadRequestError("Please provide data to create user");
    }

    const existingUser = await User.findOne({ email: req.body.email });

    if (existingUser) {
      throw new BadRequestError("Email already registered");
    }

    let finalData = { ...req.body };

    if (req.files.avatar && req.files.avatar.length) {
      finalData.avatar = req.files.avatar[0].filename;
    }

    if (req.files.banner && req.files.banner.length) {
      finalData.banner = req.files.banner[0].filename;
    }

    const user = await insertSingleUser(finalData);

    res.status(StatusCodes.CREATED).json({ msg: user });
  } catch (error) {
    if (req.files.avatar && req.files.avatar.length) {
      deleteFile(req.files.avatar[0].path);
    }

    if (req.files.banner && req.files.banner.length) {
      deleteFile(req.files.banner[0].path);
    }

    throw error;
  }
};

const getUsers = async (req, res) => {
  const { limit, page, sort, search } = req.query;

  const limitNumber = Number(limit) || 10;

  const pageNumber = Number(req.query.page) || 1;

  let skip = (pageNumber - 1) * limitNumber;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncsObj = {
      name: (name) => {
        validator.isString("name", name);
        searchObj.name = searchWithRegex(name);
      },
      email: (email) => {
        validator.isString("email", email);
        searchObj.email = searchWithRegex(email);
      },
      role: (role) => {
        validator.isEnum("role", ["user", "admin"], role);
        searchObj.role = role;
      },
      confirmed: (confirmed) => {
        const valueList = { true: true, false: false };
        searchObj.confirmed = valueList[confirmed];
      },
    };

    for (const [key, value] of searchEntries) {
      if (!searchFuncsObj[key]) {
        errors.invalidKey.push(key);
        continue;
      }

      try {
        searchFuncsObj[key](value);
      } catch (error) {
        errors.invalidValue.push(key);
      }
    }
  }

  const sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt"]);
    const sortValueEnum = { 1: 1, "-1": -1 };

    for (const [key, value] of sortEntries) {
      if (!sortKeys.has(key)) {
        errors.invalidKey.push(key);
        continue;
      }

      if (!sortValueEnum[value]) {
        errors.invalidValue.push(key);
        continue;
      }

      sortObj[key] = sortValueEnum[value];
    }
  }

  for (const error in errors) {
    if (errors[error].length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  if (isObjectEmpty(sortObj)) {
    sortObj.createdAt = -1;
  }

  const pipeline = [
    {
      $match: searchObj,
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

  const user = await getSingleUser(
    { _id: id },
    "-password -subscriber -totalVids -codeType -privateCode -__v",
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(StatusCodes.OK).json({ data: user });
};

const updateUser = async (req, res) => {
  const { id } = req.params;

  const data = req.body;

  try {
    if (Object.keys(data).length === 0 && !req.files) {
      throw new BadRequestError("No data provided to update");
    }

    await updateSingleUser({ _id: id }, data, req.files);

    res.status(StatusCodes.OK).json({ msg: "User updated successfully" });
  } catch (error) {
    if (req.files?.avatar && req.files.avatar.length) {
      deleteFile(req.files.avatar[0].path);
    }

    if (req.files?.banner && req.files.banner.length) {
      deleteFile(req.files.banner[0].path);
    }

    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
    }

    throw error;
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide user id");
  }

  try {
    await deleteSingleUser({ _id: id });

    res.status(StatusCodes.OK).json({ msg: "User deleted" });
  } catch (error) {
    throw error;
  }
};

const deleteUsers = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide a list of user's id to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  await deleteManyUser(idArray);

  res.status(StatusCodes.OK).json({
    msg: `Successfully deleted these following users : ${idList}`,
  });
};

module.exports = {
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteUsers,
  updateUser,
};
