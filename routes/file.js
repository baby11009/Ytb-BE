const express = require("express");

const router = express.Router();

const { handleViewFile } = require("../controllers/file/file");

router.route("/avatar/:name").get((req, res) => {
  handleViewFile(req, res, "user avatar");
});

router.route("/video/:name").get((req, res) => {
  handleViewFile(req, res, "videos");
});

router.route("/thumb/:name").get((req, res) => {
  handleViewFile(req, res, "video thumb");
});

router.route("/icon/:name").get((req, res) => {
  handleViewFile(req, res, "tag icon");
});

module.exports = router;
