const User = require("../../models/user");

const {
  BadRequestError,
  NotFoundError,
  UnauthenticatedError,
} = require("../../errors");
const { sendEmailConfirm } = require("../../utils/send-email");
const { generateCodeAndExpire } = require("../../utils/generator");

const { StatusCodes } = require("http-status-codes");

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

  const user = await User.create(userData);

  await sendEmailConfirm(
    email,
    "Account confirmation email",
    `
    <h1>Your confirmation code is ${confirmCode}</h1>
    `
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

  const updatedUser = await User.updateOne(
    { email },
    { confirmed: true, codeType: "", privateCode: "" }
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
    { privateCode: confirmCode, codeExpires: confirmCodeExpires }
  );

  await sendEmailConfirm(email, confirmCode);

  res.status(StatusCodes.OK).send({ msg: "Confirmation email has been sent" });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new BadRequestError("Please provide email and password");
  }

  const user = await User.findOne({ email }).select(
    "-codeExpires -codeType -privateCode"
  );

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

  const data = {
    data: {
      avatar: user.avatar,
      confirmed: user.confirmed,
      createdAt: user.createdAt,
      email: user.email,
      name: user.name,
      role: user.role,
      totalVids: user.totalVids,
      updatedAt: user.updatedAt,
      __v: user.__v,
      _id: user._id,
    },
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

  const user = await User.updateOne(
    { email },
    {
      privateCode: confirmCode,
      codeType: type,
      codeExpires: expires,
    }
  ).select("-password");

  await sendEmailConfirm(
    email,
    `Email provide OTP for purpose : ${type}`,
    `
    <h1>Your ${type} code is ${confirmCode}</h1>
    <p>The code will expire after 10 minutes</p>
    `
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
    }
  ).select("-password");

  await sendEmailConfirm(
    email,
    `Email provide OTP for purpose : ${type}`,
    `
    <h1>Your ${type} code is ${confirmCode}</h1>
    <p>The code will expire after 10 minutes</p>
    `
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

  const user = await User.updateOne(
    { email },
    { password, privateCode: "", codeType: "" }
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
    { password, privateCode: "", codeType: "" }
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
