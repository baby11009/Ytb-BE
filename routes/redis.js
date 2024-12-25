const express = require("express");
const { removeRedisKey } = require("../controllers/redis/redis.js");

const router = express.Router();

router.delete("/remove", removeRedisKey);

module.exports = router;
