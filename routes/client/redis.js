const express = require("express");
const { removeRedisKey } = require("../../controllers/client/redis");

const router = express.Router();

router.delete("/remove", removeRedisKey);

module.exports = router;
