// Client
const authRouter = require("./auth/auth");
const fileRouter = require("./client/file");
const redisRouter = require("./client/redis");
const combineRouter = require("./client/combineData");
const modifyData = require("./client/modifyData");

// Admin
const adminRouter = require("./admin");

// User
const userRouter = require("./user");

module.exports = {
  authRouter,
  adminRouter,
  userRouter,
  fileRouter,
  combineRouter,
  modifyData,
  redisRouter,
};
