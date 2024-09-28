const express = require("express");
const router = express.Router();
const multer = require("multer");

// accept data from form-data
const upload = multer();

const { authMiddleware } = require("../middlewares");

const {
  createCmt,
  getCmts,
  getVideoCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
} = require("../controllers/comment/comment");

router
  .route("/")
  .all(authMiddleware)
  .post(upload.none(), createCmt)
  .get(getCmts);

router.route("/delete-many").post(authMiddleware, deleteManyCmt);

router.route("/video-comment/:videoId").get(getVideoCmts);

router
  .route("/:id")
  .all(authMiddleware)
  .get(getCmtDetails)
  .patch(updateCmt)
  .delete(deleteCmt);

module.exports = router;
