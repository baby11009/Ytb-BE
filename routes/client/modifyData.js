const { increaseVideoView } = require("../../controllers/client/video");

const express = require("express");

const router = express.Router();

router.post("/video/:videoId/view", increaseVideoView);

module.exports = router;
