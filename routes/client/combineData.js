const express = require("express");

const {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShorts,
  getPlaylistDetails,
} = require("../../controllers/client/combineData");

const router = express.Router();

router.route("/all").get(getDataList);

router.route("/videos").get(getVideoList);

router.route("/playlists").get(getChannelPlaylistVideos);

router.route("/playlist/:id").get(getPlaylistDetails);

router.route("/channels/:email").get(getChannelInfo);

router.route("/video/:id").get(getVideoDetails);

router.route("/comment/video-cmt/:videoId").get(getVideoCmts);

// Get random short or short with id - optional
router.route("/shorts/:id?").get(getRandomShorts);

// router.route("/short/:id").get(getRandomShorts);

module.exports = router;
