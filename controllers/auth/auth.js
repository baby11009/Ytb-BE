const User = require("../../models/user");

const {
  BadRequestError,
  NotFoundError,
  UnauthenticatedError,
} = require("../../errors");
const { generateCodeAndExpire } = require("../../utils/generator");
const { StatusCodes } = require("http-status-codes");
const { sessionWrap } = require("../../utils/session");
const {
  sendEmailNotification,
} = require("../../service/notification/notification");
const bcrypt = require('bcryptjs')

const register = async (req, res) => {
  const { email } = req.body;

  if (Object.keys(req.body).length === 0) {
    throw new BadRequestError("Please provide data to register");
  }

  const foundUser = await User.findOne({ email }).select("password");

  if (foundUser) {
    throw new BadRequestError("Email has already been registered");
  }

  const { confirmCode, confirmCodeExpires } = generateCodeAndExpire();

  const userData = {
    ...req.body,
    privateCode: confirmCode,
    codeExpires: confirmCodeExpires,
  };

  await sessionWrap(async (session) => {
    const user = await User.create([userData], { session });

    return user;
  });

  await sendEmailNotification(
    email,
    "Account confirmation email",
    `
      <h1>Your confirmation code is ${confirmCode}</h1>
      `,
  );

  res
    .status(StatusCodes.CREATED)
    .json({ msg: "Check your email to get confirmation code" });
};

const verifyAccount = async (req, res) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw new NotFoundError("Email is not registered");
  }

  if (user.codeExpires < Date.now()) {
    throw new BadRequestError("The confirmation code has expired");
  }

  if (user.confirmed) {
    throw new BadRequestError("Account has already been confirmed");
  }

  if (user.privateCode !== code) {
    throw new BadRequestError("Confirmation code is wrong");
  }

  await User.updateOne(
    { email },
    { confirmed: true, codeType: "", privateCode: "" },
  );

  res.status(StatusCodes.OK).send({ msg: "Account verification successful" });
};

const resendConfirmCode = async (req, res) => {
  const { email } = req.body;

  if (email === "" || !email) {
    throw new BadRequestError("Please provide email address");
  }

  const foundUser = await User.findOne({ email });

  if (!foundUser) {
    throw new NotFoundError("Email is not registered");
  }

  if (foundUser.confirmed) {
    throw new BadRequestError("The account has already been confirmed");
  }
  const { confirmCode, confirmCodeExpires } = generateCodeAndExpire();

  const user = await User.updateOne(
    { email },
    { privateCode: confirmCode, codeExpires: confirmCodeExpires },
  );

  await sendEmailNotification(email, "Account confirmation email", confirmCode);

  res.status(StatusCodes.OK).send({ msg: "Confirmation email has been sent" });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new BadRequestError("Please provide email and password");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new UnauthenticatedError(`Email ${email} is not registered`);
  }

  if (!user.confirmed) {
    throw new UnauthenticatedError("Account is not confirmed");
  }

  const isCorrectPw = await user.comparePassword(password);

  if (!isCorrectPw) {
    throw new UnauthenticatedError("Wrong password");
  }

  const userData = await User.aggregate([
    { $match: { _id: user._id } },
    {
      $lookup: {
        from: "subscribes",
        pipeline: [
          {
            $match: {
              subscriber_id: user._id,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "channel_id",
              foreignField: "_id",
              pipeline: [
                { $project: { _id: 1, email: 1, name: 1, avatar: 1 } },
              ],
              as: "channel_info",
            },
          },
          {
            $unwind: {
              path: "$channel_info",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              "channel_info._id": 1,
              "channel_info.email": 1,
              "channel_info.name": 1,
              "channel_info.avatar": 1,
            },
          },
        ],
        as: "subscribed_list",
      },
    },
    {
      $project: {
        _id: 1,
        email: 1,
        name: 1,
        avatar: 1,
        banner: 1,
        role: 1,
        description: 1,
        subscriber: 1,
        totalVids: 1,
        description: 1,
        subscribed_list: 1,
        notReadedNotiCount: 1,
      },
    },
  ]);

  const data = {
    data: userData[0],
    token: user.createJwt(),
  };

  res.status(StatusCodes.OK).json(data);
};

const sendConfirmCode = async (req, res) => {
  const { email, type } = req.body;

  if (!email || email === "") {
    throw new BadRequestError("Please provide email");
  }

  const { confirmCode, confirmCodeExpires } = generateCodeAndExpire();

  let expires;

  if (type !== "verify") {
    expires = confirmCodeExpires;
  }

  await User.updateOne(
    { email },
    {
      privateCode: confirmCode,
      codeType: type,
      codeExpires: expires,
    },
  );

  await sendEmailNotification(
    email,
    `Email provide OTP for purpose : ${type}`,
    `
    <h1>Your ${type} code is ${confirmCode}</h1>
    <p>The code will expire after 10 minutes</p>
    `,
  );

  res.status(StatusCodes.OK).json({ msg: "Check your email to get code" });
};

const sendCode = async (req, res) => {
  const { email, type } = req.body;

  const user = await User.findOne({ email: email });

  if (!user) {
    throw new NotFoundError(`Email ${email} is not registered`);
  }

  const { confirmCode, confirmCodeExpires } = generateCodeAndExpire();

  let expires;

  if (type !== "verify") {
    expires = confirmCodeExpires;
  }

  const udUser = await User.updateOne(
    { email },
    {
      privateCode: confirmCode,
      codeType: type,
      codeExpires: expires,
    },
  ).select("-password");

  await sendEmailNotification(
    email,
    `Email provide OTP for purpose : ${type}`,
    `
    <h1>Your ${type} code is ${confirmCode}</h1>
    <p>The code will expire after 10 minutes</p>
    `,
  );

  res.status(StatusCodes.OK).json({ msg: "Check your email to get code" });
};

const changePassword = async (req, res) => {
  const { email, password, type } = req.body;

  if (!email || email === "") {
    throw new BadRequestError("Please provide email");
  }
  if (!password || password === "") {
    throw new BadRequestError("Please provide password");
  }

  const foundedUser = await User.findOne({ email });

  if (!foundedUser) {
    throw new NotFoundError("Email is not registered");
  }

  const isMatch = await foundedUser.comparePassword(password);

  if (isMatch) {
    throw new BadRequestError("New password is already in use");
  }
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  await User.updateOne(
    { email },
    { password: hashedPassword, privateCode: "", codeType: "" },
  );

  let msg;

  switch (type) {
    case "forgot":
      msg = "Password reset successfully";
      break;
    default:
      msg = "Password updated successfully";
      break;
  }

  res.status(StatusCodes.OK).send({ msg });
};

const validOtp = async (req, res) => {
  const { email, type, code } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw new NotFoundError("Email is not registered");
  }

  if (user.codeType !== type) {
    throw new BadRequestError(`Current OTP is not use for ${type} purpose`);
  }

  if (user.codeExpires < Date.now()) {
    throw new BadRequestError("The confirmation OTP has expired");
  }

  if (user.privateCode !== code) {
    throw new BadRequestError(" OTP is not match");
  }

  res.status(StatusCodes.OK).send({ msg: `${type} otp is valid` });
};

const resetPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!email || email === "") {
    throw new BadRequestError("Please provide email");
  }
  if (!password || password === "") {
    throw new BadRequestError("Please provide password");
  }

  const foundedUser = await User.findOne({ email });

  if (!foundedUser) {
    throw new NotFoundError("Email is not registered");
  }

  const isMatch = await foundedUser.comparePassword(password);

  if (isMatch) {
    throw new BadRequestError("New password is already in use");
  }

  const user = await User.updateOne(
    { email },
    { password, privateCode: "", codeType: "" },
  );

  res.status(StatusCodes.OK).send({ msg: "Password reset successfully" });
};

module.exports = {
  register,
  login,
  verifyAccount,
  resendConfirmCode,
  sendConfirmCode,
  sendCode,
  changePassword,
  validOtp,
  resetPassword,
};
