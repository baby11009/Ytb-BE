const express = require("express");

const {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
  getVideoComments,
} = require("../../controllers/user/comment");

const router = express.Router();

router.route("/").post(createCmt).get(getCmts);

router.route("/delete-many").post(deleteManyCmt);
router.route("/video-comments").get(getVideoComments);

router
  .route("/:id")
  .get(getCmtDetails)
  .patch(updateCmt)
  .delete(deleteCmt);

module.exports = router;
