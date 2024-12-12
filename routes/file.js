const express = require("express");

const router = express.Router();

const {
  handleViewImage,
  handleStreamVideoOptions,
  handleStreamVideo,
  handleStreamVideoSegment,
} = require("../controllers/file/file");

router.route("/avatar/:name").get(async (req, res) => {
  try {
    await handleViewImage(req, res, "user avatar");
  } catch (error) {
    throw error;
  }
});

router.route("/videomaster/:name").get(async (req, res, next) => {
  try {
    await handleStreamVideoOptions(req, res, next);
  } catch (error) {
    throw error;
  }
});

router.route("/video/:name").get(async (req, res, next) => {
  try {
    await handleStreamVideo(req, res, next);
  } catch (error) {
    throw error;
  }
});

router.route("/segment/:name").get(async (req, res, next) => {
  try {
    await handleStreamVideoSegment(req, res, next);
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
