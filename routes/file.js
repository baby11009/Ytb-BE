const express = require("express");

const router = express.Router();

const {
  handleViewImage,
  handleViewVideo,
} = require("../controllers/file/file");

router.route("/avatar/:name").get(async (req, res) => {
  try {
    await handleViewImage(req, res, "user avatar");
  } catch (error) {
    throw error;
  }
});

router.route("/video/:name").get(async (req, res, next) => {
  try {
    await handleViewVideo(req, res, next);
  } catch (error) {
    throw error;
  }
});

router.route("/thumb/:name").get(async (req, res) => {
  try {
    await handleViewImage(req, res, "video thumb");
  } catch (error) {
    throw error;
  }
});

router.route("/icon/:name").get(async (req, res) => {
  try {
    await handleViewImage(req, res, "tag icon");
  } catch (error) {
    throw error;
  }
});

module.exports = router;
