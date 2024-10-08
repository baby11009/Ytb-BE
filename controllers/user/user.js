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
const path = require("path");
const avatarPath = path.join(__dirname, "../../assets/user avatar");
const videoThumbPath = path.join(__dirname, "../../assets/video thumb");
const videoPath = path.join(__dirname, "../../assets/videos");

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
    (key) =>
      key !== "limit" &&
      key !== "page" &&
      key !== "createdAt" &&
      key !== "select"
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

  // Xóa avatar & banner của user đã upload

  if (foundedUser.avatar !== "df.jpg") {
    deleteFile(path.join(avatarPath, foundedUser.avatar));
  }

  if (foundedUser.banner !== "df-banner.jpg") {
    deleteFile(path.join(avatarPath, foundedUser.banner));
  }

  // Tìm các video do user đăng tải
  const foundedVideo = await Video.find({ user_id: foundedUser._id });

  if (foundedVideo.length > 0) {
    for (const video of foundedVideo) {
      // Xóa các file thumb, video của video đã tìm thấy do user đăng tải
      deleteFile(path.join(videoPath, video.video));
      deleteFile(path.join(videoThumbPath, video.thumb));

      // Tìm các comment thuộc video
      const foundedCmt = await Comment.find({ video_id: video._id });

      // Xóa các react của comment tìm thấy
      foundedCmt.map(async (cmt) => {
        await CmtReact.deleteMany({ cmt_id: cmt._id });
      });

      // Cập nhật lại list item để loại bỏ video đã bị xóa khỏi playlist
      await Playlist.updateMany(
        { itemList: video._id.toString() },
        { $pull: { itemList: video._id.toString() } }
      );

      // Xóa các comment thuộc video
      await Comment.deleteMany({ video_id: video._id });

      // Xóa các react của video
      await React.deleteMany({ video_id: video._id });
    }

    // Xóa các video do user đăng tải
    await Video.deleteMany({ user_id: foundedUser._id });
  }

  // Tìm các subscribe của user
  const foundedSubscribe = await Subscribe.find({
    $or: [{ subscriber_id: foundedUser._id }, { channel_id: foundedUser._id }],
  });

  if (foundedSubscribe.length > 0) {
    for (const subscribe of foundedSubscribe) {
      //Cập nhật lại subscriber của video tương ứng các subscribe tìm thấy
      await User.updateOne(
        { _id: subscribe.channel_id },
        { $inc: { subscriber: -1 } }
      );
    }

    // Xóa các subscribe
    await Subscribe.deleteMany({
      $or: [
        { subscriber_id: foundedUser._id },
        { channel_id: foundedUser._id },
      ],
    });
  }

  // Tìm các react do user tạo
  const foundedReact = await React.find({ user_id: foundedUser._id });

  if (foundedReact.length > 0) {
    for (const react of foundedReact) {
      // Cập nhất lại số lượng like và dislike của video tương ứng với react
      let updateObject = { $inc: { like: -1 } };
      if (react.type === "dislike") {
        updateObject = { $inc: { dislike: -1 } };
      }
      await Video.updateOne({ _id: react.video_id }, updateObject);
    }

    // Xóa các React do user tạo
    await React.deleteMany({ user_id: foundedUser._id });
  }

  // Xóa các playlist do user tạo
  await Playlist.deleteMany({ created_user_id: foundedUser._id });

  // Tìm các comment do user tạo
  const foundedCmt = await Comment.find({ user_id: foundedUser._id });

  if (foundedCmt.length > 0) {
    for (const cmt of foundedCmt) {
      // Nếu là 1 comment reply comment nào đó thì thực hiện
      if (cmt.replied_cmt_id) {
        let findObject = { _id: cmt.replied_cmt_id };
        if (cmt.replied_parent_cmt_id) {
          findObject = { _id: cmt.replied_parent_cmt_id };
        }
        // Xóa các react của comment đã tìm thấy
        await CmtReact.deleteMany({ cmt_id: cmt._id });

        // Cập nhật lại số lượng comment reply của thằng comment đc reply
        await Comment.updateOne(findObject, {
          $inc: { replied_cmt_total: -1 },
        });
      }

      // Cập nhật lại số lượng comment của video tương ứng với comment
      await Video.updateOne({ _id: cmt.video_id }, { $inc: { totalCmt: -1 } });
    }

    // Xóa các comment do user tạo
    await Comment.deleteMany({ user_id: foundedUser._id });
  }

  // Tìm các cmtReact do user tạo
  const foundedCmtReact = await CmtReact.find({
    user_id: foundedUser._id,
  });

  if (foundedCmtReact.length > 0) {
    for (const cmtReact of foundedCmtReact) {
      // Cập nhật lại số lượng like và dislike của comment tương ứng với cmtReact
      let updateObject = { $inc: { like: -1 } };
      if (cmtReact.type === "dislike") {
        updateObject = { $inc: { dislike: -1 } };
      }
      await Comment.updateOne({ _id: cmtReact._id }, updateObject);
    }

    // Xóa comment react
    await CmtReact.deleteMany({ user_id: foundedUser._id });
  }

  await User.deleteOne({ _id: foundedUser._id });

  res.status(StatusCodes.OK).json({ msg: "User deleted" });
};

const deleteManyUsers = async (req, res) => {
  const { idList } = req.body;

  if (!idList || !Array.isArray(idList) || idList.length === 0) {
    throw new BadRequestError("Please provide a list of user to delete");
  }

  let foundedUsers = await User.find({ _id: { $in: idList } });

  if (foundedUsers.length === 0) {
    throw new NotFoundError(
      `No user found with these ids ${idList.joing(", ")}`
    );
  } else if (foundedUsers.length !== idList.length) {
    foundedUsers = foundedUsers.map((user) => user._id.toString());

    const notFoundedList = idList.filter((id) => !foundedUsers.includes(id));

    throw new NotFoundError(
      `No user found with these ids : ${notFoundedList.join(", ")}`
    );
  }

  for (const foundedUser of foundedUsers) {
    // Xóa avatar & banner của foundedUser đã upload

    if (foundedUser.avatar && foundedUser.avatar !== "df.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.avatar));
    }

    if (foundedUser.banner !== "df-banner.jpg") {
      deleteFile(path.join(avatarPath, foundedUser.banner));
    }

    const foundedVideo = await Video.find({ user_id: foundedUser._id });

    if (foundedVideo.length > 0) {
      for (const video of foundedVideo) {
        // Xóa các file thumb, video của video đã tìm thấy do user đăng tải
        deleteFile(path.join(videoPath, video.video));
        deleteFile(path.join(videoThumbPath, video.thumb));

        // Tìm các comment thuộc video
        const foundedCmt = await Comment.find({ video_id: video._id });

        // Xóa các react của comment tìm thấy
        foundedCmt.map(async (cmt) => {
          await CmtReact.deleteMany({ cmt_id: cmt._id });
        });

        // Cập nhật lại list item để loại bỏ video đã bị xóa khỏi playlist
        await Playlist.updateMany(
          { itemList: video._id.toString() },
          { $pull: { itemList: video._id.toString() } }
        );

        // Xóa các comment thuộc video
        await Comment.deleteMany({ video_id: video._id });

        // Xóa các react của video
        await React.deleteMany({ video_id: video._id });
      }

      // Xóa các video do user đăng tải
      await Video.deleteMany({ user_id: foundedUser._id });
    }

    // Tìm các subscribe của user
    const foundedSubscribe = await Subscribe.find({
      $or: [
        { subscriber_id: foundedUser._id },
        { channel_id: foundedUser._id },
      ],
    });

    if (foundedSubscribe.length > 0) {
      for (const subscribe of foundedSubscribe) {
        //Cập nhật lại subscriber của video tương ứng các subscribe tìm thấy
        await User.updateOne(
          { _id: subscribe.channel_id },
          { $inc: { subscriber: -1 } }
        );
      }

      // Xóa các subscribe
      await Subscribe.deleteMany({
        $or: [
          { subscriber_id: foundedUser._id },
          { channel_id: foundedUser._id },
        ],
      });
    }

    // Tìm các react do user tạo
    const foundedReact = await React.find({ user_id: foundedUser._id });

    if (foundedReact.length > 0) {
      for (const react of foundedReact) {
        // Cập nhất lại số lượng like và dislike của video tương ứng với react
        let updateObject = { $inc: { like: -1 } };
        if (react.type === "dislike") {
          updateObject = { $inc: { dislike: -1 } };
        }
        await Video.updateOne({ _id: react.video_id }, updateObject);
      }

      // Xóa các React do user tạo
      await React.deleteMany({ user_id: foundedUser._id });
    }

    // Xóa các playlist do user tạo
    await Playlist.deleteMany({ created_user_id: foundedUser._id });

    // Tìm các comment do user tạo
    const foundedCmt = await Comment.find({ user_id: foundedUser._id });

    if (foundedCmt.length > 0) {
      for (const cmt of foundedCmt) {
        // Nếu là 1 comment reply comment nào đó thì thực hiện
        if (cmt.replied_cmt_id) {
          let findObject = { _id: cmt.replied_cmt_id };
          if (cmt.replied_parent_cmt_id) {
            findObject = { _id: cmt.replied_parent_cmt_id };
          }
          // Xóa các react của comment đã tìm thấy
          await CmtReact.deleteMany({ cmt_id: cmt._id });

          // Cập nhật lại số lượng comment reply của thằng comment đc reply
          await Comment.updateOne(findObject, {
            $inc: { replied_cmt_total: -1 },
          });
        }

        // Cập nhật lại số lượng comment của video tương ứng với comment
        await Video.updateOne(
          { _id: cmt.video_id },
          { $inc: { totalCmt: -1 } }
        );
      }

      // Xóa các comment do user tạo
      await Comment.deleteMany({ user_id: foundedUser._id });
    }

    // Tìm các cmtReact do user tạo
    const foundedCmtReact = await CmtReact.find({
      user_id: foundedUser._id,
    });

    if (foundedCmtReact.length > 0) {
      for (const cmtReact of foundedCmtReact) {
        // Cập nhật lại số lượng like và dislike của comment tương ứng với cmtReact
        let updateObject = { $inc: { like: -1 } };
        if (cmtReact.type === "dislike") {
          updateObject = { $inc: { dislike: -1 } };
        }
        await Comment.updateOne({ _id: cmtReact._id }, updateObject);
      }

      // Xóa comment react
      await CmtReact.deleteMany({ user_id: foundedUser._id });
    }
  }

  await User.deleteMany({ _id: { $in: idList } });

  res.status(StatusCodes.OK).json({
    msg: `Successfully deleted these following users : ${idList.join(", ")}`,
  });
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
      "name password role confirmed subscriber totalVids banner avatar"
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
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteManyUsers,
  updateUser,
};
