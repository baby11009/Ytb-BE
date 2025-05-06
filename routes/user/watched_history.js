const express = require("express");

const router = express.Router();

const {
  setWatchedHistoryList,
  getWatchedHistoryList,
  deleteWatchedHistory,
  deleteAllWatchedHistory,
} = require("../../controllers/user/watched_history");

router.route("/").get(getWatchedHistoryList).post(setWatchedHistoryList);

router.delete("/delete-all", deleteAllWatchedHistory);

router.delete("/:historyId", deleteWatchedHistory);

module.exports = router;
