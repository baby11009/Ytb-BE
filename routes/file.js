const express = require("express");

const router = express.Router();

const {
  handleViewImage,
  handleViewVideo,
} = require("../controllers/file/file");

router.route("/avatar/:name").get((req, res) => {
  handleViewImage(req, res, "user avatar");
});

router.route("/video/:name").get((req, res) => {
  handleViewVideo(req, res);
});

router.route("/thumb/:name").get((req, res) => {
  handleViewImage(req, res, "video thumb");
});

router.route("/icon/:name").get((req, res) => {
  handleViewImage(req, res, "tag icon");
});

module.exports = router;
