const express = require("express");
const router = express.Router()

const { authMiddleware } = require("../middlewares");

const {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
} = require("../controllers/comment/comment");

router
  .route("/")
  .all(authMiddleware)
  .post(createCmt)
  .get(getCmts);

router.route("/delete-many").post(authMiddleware, deleteManyCmt);

router
  .route("/:id")
  .all(authMiddleware)
  .get(getCmtDetails)
  .patch(updateCmt)
  .delete(deleteCmt);

module.exports = router;
