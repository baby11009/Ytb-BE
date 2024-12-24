const express = require("express");

const {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShorts,
  getRandomShort,
  getPlaylistDetails,
} = require("../controllers/client/combineData");

const router = express.Router();

router.route("/all").get(getDataList);

router.route("/videos").get(getVideoList);

router.route("/playlists").get(getChannelPlaylistVideos);

router.route("/playlist/:id").get(getPlaylistDetails);

router.route("/channels/:email").get(getChannelInfo);

router.route("/video/:id").get(getVideoDetails);

router.route("/comment/video-cmt/:videoId").get(getVideoCmts);

router.route("/shorts").get(getRandomShorts);

// Get random short or short with id - optional
router.route("/short").get(getRandomShort);

router.route("/short/:id").get(getRandomShort);

module.exports = router;
