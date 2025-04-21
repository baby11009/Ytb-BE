const express = require("express");

const {
  getRandomData,
  getVideoList,
  getDataList,
  getSearchingDatas,
  getChannelInfo,
  getChannelData,
  getChannelPlaylistVideos,
  getVideoDetails,
  getVideoCmts,
  getRandomShorts,
  getPlaylistDetails,
  getTagsList,
} = require("../../controllers/client/combineData");

const router = express.Router();

router.route("/all").get(getDataList);

router.route("/random").get(getRandomData);

router.route("/search").get(getSearchingDatas);

router.route("/all/:email").get(getChannelData);

router.route("/videos").get(getVideoList);

router.route("/playlists").get(getChannelPlaylistVideos);

router.route("/playlist/:id").get(getPlaylistDetails);

router.route("/channel/:email").get(getChannelInfo);

router.route("/video/:id").get(getVideoDetails);

router.route("/comment/video-cmt/:videoId").get(getVideoCmts);

// Get random short or short with id - optional
router.route("/shorts/:id?").get(getRandomShorts);

router.route("/tags").get(getTagsList);

module.exports = router;
