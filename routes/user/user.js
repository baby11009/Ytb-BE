const express = require("express");
const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../../middlewares");

const {
  settingAccount,
  getSubscribedChannels,
  getSubscribedChannelsVideos,
  getWatchLaterDetails,
  getLikedVideoList,
  getAccountInfo,
  getNotificationList,
} = require("../../controllers/user/user");

const router = express.Router();

// user
router
  .route("/me")
  .get(getAccountInfo)
  .patch(
    createMulterUpload("user avatar", 0).fields([
      { name: "avatar", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { avatar: 2, banner: 4 });
    },
    settingAccount,
  );
router.get("/subscribed-channels", getSubscribedChannels);
router.get("/subscribed-channels-videos", getSubscribedChannelsVideos);
router.get("/watchlater", getWatchLaterDetails);
router.get("/likedvideos", getLikedVideoList);
router.get("/notification", getNotificationList);

module.exports = router;
