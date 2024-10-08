const express = require("express");

const {
  getVideoList,
  getDataList,
  getChannelInfo,
  getChannelPlaylistVideos,
} = require("../controllers/client/combineData");

const router = express.Router();

router.route("/all").get(getDataList);

router.route("/videos").get(getVideoList);

router.route("/playlists").get(getChannelPlaylistVideos);

router.route("/channels/:email").get(getChannelInfo);

module.exports = router;
