const authRouter = require("./auth");
const userRouter = require("./user");
const fileRouter = require("./file");
const clientUser = require("./client-user");
const videoRouter = require("./video");
const clientVideo = require("./client-video");
const commentRouter = require("./comment");
const subscribeRouter = require("./subscribe");
const reactRouter = require("./react");
const cmtReactRouter = require("./commentReact");
const playlistRouter = require("./playlist");
const tagRouter = require("./tag");
const combineRouter = require("./combineData");

module.exports = {
  authRouter,
  userRouter,
  fileRouter,
  clientUser,
  videoRouter,
  clientVideo,
  commentRouter,
  subscribeRouter,
  reactRouter,
  cmtReactRouter,
  playlistRouter,
  tagRouter,
  combineRouter,
};
