// Client
const authRouter = require("./auth/auth");
const fileRouter = require("./client/file");
const redisRouter = require("./client/redis");
const combineRouter = require("./client/combineData");

// Admin
const adminRouter = require("./admin");

// User
const userRouter = require("./user");

module.exports = {
  adminRouter,
  authRouter,
  fileRouter,
  combineRouter,
  userRouter,
  redisRouter,
};
