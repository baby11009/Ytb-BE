const express = require("express");

const userRouter = require("./admin/user");
const videoRouter = require("./admin/video");
const commentRouter = require("./admin/comment");
const playlistRouter = require("./admin/playlist");
const tagRouter = require("./admin/tag");
const notificationRouter = require("./admin/notification");

const router = express.Router();

router.use("/user", userRouter);

router.use("/video", videoRouter);

router.use("/comment", commentRouter);

router.use("/playlist", playlistRouter);

router.use("/tag", tagRouter);

router.use("/notification", notificationRouter);

module.exports = router;
