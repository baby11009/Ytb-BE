const express = require("express");
const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
  getAccountInfoMiddleware,
} = require("../middlewares");
const {
  getAccountInfo,
  getSubscribedChannels,
  settingAccount,
  getSubscribedChannelsVideos,
  getWatchLaterDetails,
} = require("../controllers/client/client-user");
const {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
} = require("../controllers/client/client-video");
const {
  toggleSubscribe,
  modifySubscribe,
  getSubscriptionState,
} = require("../controllers/client/client-subscribe");
const {
  toggleReact,
  getVideotReactState,
} = require("../controllers/client/client-react");
const {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
  getVideoComments,
} = require("../controllers/client/client-comment");

const {
  createPlaylist,
  getPlaylists,
  getPlaylistDetails,
  updatePlaylist,
  deletePlaylist,
  deleteManyPlaylist,
} = require("../controllers/client/client-playlist");
const { toggleCmtReact } = require("../controllers/client/client-cmtReact");
const router = express.Router();

// user
router
  .route("/user/me")
  .get(getAccountInfo)
  .patch(
    createMulterUpload("user avatar", 0).fields([
      { name: "image", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { image: 4, banner: 6 });
    },
    settingAccount
  );
router.get("/user/subscribed-channels", getSubscribedChannels);
router.get("/user/subscribed-channels-videos", getSubscribedChannelsVideos);
router.get("/user/watchlater", getWatchLaterDetails);

// video
router.post(
  "/video/upload",
  createMulterUpload("video thumb", "videos").fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  multerErrorHandling,
  async (req, res, next) => {
    fileLimitSizeMiddleware(req, res, next, { image: 4 });
  },
  upLoadVideo
);

router.route("/video").get(getVideos);

router.route("/video/delete-many").post(deleteManyVideos);

router
  .route("/video/:id")
  .delete(deleteVideo)
  .get(getVideoDetails)
  .patch(
    createMulterUpload("video thumb").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { image: 4 });
    },
    updateVideo
  );

// subscribe
router.route("/subscribe").post(toggleSubscribe);
router.route("/subscribe/:id").patch(modifySubscribe).get(getSubscriptionState);

// video react
router.route("/react").post(toggleReact);
router.route("/react/:videoId").get(getVideotReactState);

// comment

router.route("/comment").post(createCmt).get(getCmts);

router.route("/comment/delete-many").post(deleteManyCmt);
router.route("/comment/video-comments").get(getVideoComments);

router
  .route("/comment/:id")
  .get(getCmtDetails)
  .patch(updateCmt)
  .delete(deleteCmt);

// comment react

router.route("/cmt-react").post(toggleCmtReact);

// playlist
router.route("/playlist").get(getPlaylists).post(createPlaylist);

router.route("/playlist/delete-many").post(deleteManyPlaylist);

router
  .route("/playlist/:id")
  .get(getPlaylistDetails)
  .patch(updatePlaylist)
  .delete(deletePlaylist);

module.exports = router;
