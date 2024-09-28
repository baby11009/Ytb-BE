const {
  User,
  Video,
  Subscribe,
  React,
  Playlist,
  Comment,
  CmtReact,
} = require("../../models");
const { BadRequestError, NotFoundError } = require("../../errors");
const { StatusCodes } = require("http-status-codes");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const avatarPath = path.join(__dirname, "../../assets/user avatar");
const videoThumb = path.join(__dirname, "../../assets/video thumb");
const videos = path.join(__dirname, "../../assets/videos");

const createUser = async (req, res) => {
  const keys = Object.keys(req.body);

  if (keys.length === 0) {
    if (req.files.image) {
      deleteFile(req.files.image[0].path);
    }
    if (req.files.banner) {
      deleteFile(req.files.banner[0].path);
    }
    throw new BadRequestError("Please provide data to create user");
  }

  const existingUser = await User.findOne({ email: req.body.email });

  if (existingUser) {
    if (req.files.image) {
      deleteFile(req.files.image[0].path);
    }
    if (req.files.banner) {
      deleteFile(req.files.banner[0].path);
    }
    throw new BadRequestError("Email already registered");
  }

  let finalData = { ...req.body };

  if (req.files.image) {
    finalData.avatar = req.files.image[0].filename;
  }

  if (req.files.banner) {
    finalData.banner = req.files.banner[0].filename;
  }

  const user = await User.create(finalData);

  res.status(StatusCodes.CREATED).json({ msg: user });
};

const getUsers = async (req, res) => {
  let limit = Number(req.query.limit) || 5;
  let page = Number(req.query.page) || 1;

  let skip = (page - 1) * limit;

  const findParams = Object.keys(req.query).filter(
    (key) => key !== "limit" && key !== "page" && key !== "createdAt"
  );

  let findObj = {};

  findParams.forEach((item) => {
    if (item === "role") {
      findObj[item] = req.query[item];
    } else if (item === "confirmed") {
      let value = true;
      if (req.query[item] === "false") {
        value = false;
      }
      findObj[item] = value;
    } else {
      findObj[item] = { $regex: req.query[item], $options: "i" };
    }
  });
  let sortNum = 1;

  if (req.query.createdAt === "mới nhất") {
    sortNum = -1;
  }

  const pipeline = [
    {
      $match: findObj,
    },
    {
      $project: {
        _id: 1,
        email: 1,
        name: 1,
        role: 1,
        confirmed: 1,
        privateCode: 1,
        codeType: 1,
        subscriber: 1,
        avatar: 1,
        banner: { $ifNull: ["$banner", null] },
        totalVids: 1,
        createdAt: 1,
      },
    },
    {
      $sort: {
        createdAt: sortNum,
      },
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
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

  const user = await User.findById(id);

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

  //   if (foundedUser.avatar && foundedUser.avatar !== "df.jpg") {
  //     deleteFile(path.join(avatarPath, foundedUser.avatar));
  //   }

  //   if (foundedUser.banner) {
  //     deleteFile(path.join(avatarPath, foundedUser.banner));
  //   }

  const foundedVideo = await Video.find({ user_id: foundedUser._id });

  if (foundedVideo.length > 0) {
    foundedVideo.map(async (video) => {
      const foundedCmt = await Comment.find({ video_id: video._id });
      foundedCmt.map(async (cmt) => {
        await CmtReact.deleteMany({ cmt_id: cmt._id });
      });
      await Playlist.updateMany(
        { itemList: video._id.toString() },
        { $pull: { itemList: video._id.toString() } }
      );
      await Comment.deleteMany({ video_id: video._id });
      await React.deleteMany({ video_id: video._id });
    });
  }

  //   await Video.deleteMany({ user_id: foundedUser._id });

  await Subscribe.deleteMany({
    $or: [{ subscriber_id: foundedUser._id }, { channel_id: foundedUser._id }],
  });

  //   await React.deleteMany({ user_id: foundedUser._id });

  //   await Playlist.deleteMany({ created_user_id: foundedUser._id });

  //   await Comment.deleteMany({ created_user_id: foundedUser._id });

  //   await CmtReact.deleteMany({ user_id: foundedUser._id });

  res.status(StatusCodes.OK).json({ msg: "User deleted" });
};
const deleteManyUsers = async (req, res) => {
  res.status().json({});
};
const updateUser = async (req, res) => {
  res.status().json({});
};
module.exports = {
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteManyUsers,
  updateUser,
};
