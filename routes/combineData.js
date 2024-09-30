const express = require("express");

const { getVideoList } = require("../controllers/client/combineData");

const router = express.Router();

router.route("/videos").get(getVideoList);

module.exports = router;
