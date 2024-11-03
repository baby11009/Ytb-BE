const express = require("express");

const {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShort,
} = require("../controllers/client/combineData");

const router = express.Router();

router.route("/all").get(getDataList);

router.route("/videos").get(getVideoList);

router.route("/playlists").get(getChannelPlaylistVideos);

router.route("/channels/:email").get(getChannelInfo);

router.route("/video/:id").get(getVideoDetails);

router.route("/comment/video-cmt/:videoId").get(getVideoCmts);

router.route("/short").get(getRandomShort);

module.exports = router;
