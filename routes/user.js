const express = require("express");

const userRouter = require("./user/user");
const videoRouter = require("./user/video");
const playlistRouter = require("./user/playlist");
const commentRouter = require("./user/comment");
const videoReactRouter = require("./user/video-react");
const commentReactRouter = require("./user/comment-react");
const subscriptionRouter = require("./user/subscription");

const router = express.Router();

router.use("/", userRouter);

router.use("/video", videoRouter);

router.use("/playlist", playlistRouter);

router.use("/comment", commentRouter);

router.use("/video-react", videoReactRouter);

router.use("/comment-react", commentReactRouter);

router.use("/subscription", subscriptionRouter);

module.exports = router;
