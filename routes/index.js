const authRouter = require("./auth");
const userRouter = require("./user");
const fileRouter = require("./file");
const videoRouter = require("./video");
const commentRouter = require("./comment");
const playlistRouter = require("./playlist");
const tagRouter = require("./tag");
const combineRouter = require("./combineData");
const clientRouter = require("./client");
const redisRouter = require("./redis");

module.exports = {
  authRouter,
  userRouter,
  fileRouter,
  videoRouter,
  commentRouter,
  playlistRouter,
  tagRouter,
  combineRouter,
  clientRouter,
  redisRouter
};
