const express = require("express");
const {
  removeRedisKey,
  cleanRedisRandomKey,
} = require("../../controllers/client/redis");

const router = express.Router();

router.delete("/remove", removeRedisKey);
router.delete("/clean/random", cleanRedisRandomKey);

module.exports = router;
