const User = require("../models/user");
const jwt = require("jsonwebtoken");

const { UnauthenticatedError, BadRequestError } = require("../errors");

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthenticatedError("Authentication invalid");
  }
  
  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.userId).select("-password");
    
    if (user.confirmed === false) {
      return next(new BadRequestError("Account not confirmed"));
    }

    // if (payload.exp * 1000 < Date.now()) {
    //   return next(new BadRequestError("Token expired"));
    // }

    req.user = {
      userId: payload.userId,
      name: payload.username,
      role: user.role,
    };

    next();
  } catch (error) {
    throw new UnauthenticatedError("Authentication invalid");
  }
};

module.exports = auth;
