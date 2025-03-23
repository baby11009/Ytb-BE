const express = require("express");
const router = express.Router();

const {
  createCmt,
  getCmts,
  getCmtDetails,
  updateCmt,
  deleteCmt,
  deleteManyCmt,
} = require("../../controllers/admin/comment");

router.route("/").post(createCmt).get(getCmts);

router.route("/delete-many").delete(deleteManyCmt);

router.route("/:id").get(getCmtDetails).patch(updateCmt).delete(deleteCmt);

module.exports = router;
