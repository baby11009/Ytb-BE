const express = require("express");
const {
  removeRedisKey,
  cleanRedisKey,
} = require("../../controllers/client/redis");

const router = express.Router();

router.delete("/remove", removeRedisKey);
router.delete("/clean/random", cleanRedisKey);

module.exports = router;
