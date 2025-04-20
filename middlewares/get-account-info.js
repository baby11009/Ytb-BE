const { User } = require("../models");
const jwt = require("jsonwebtoken");

const getAccountInfo = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.userId).select("-password");

    if (user.confirmed === false) {
      return next(new BadRequestError("Account not confirmed"));
    }

    // if (payload.exp * 1000 < Date.now()) {
    //   return next(new BadRequestError("Token expired"));
    // }

    req.user = {
      userId: user._id,
      name: payload.username,
      role: user.role,
    };
  }

  next();
};
module.exports = getAccountInfo;
