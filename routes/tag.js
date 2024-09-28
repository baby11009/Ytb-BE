const express = require("express");

const router = express.Router();

const { createMulterUpload, multerErrorHandling } = require("../middlewares");

const {
  createTag,
  getTags,
  getTagDetails,
  updateTag,
  deleteTag,
  deleteManyTags,
} = require("../controllers/tag/tag");

router
  .route("/")
  .get(getTags)
  .post(
    createMulterUpload("tag icon").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    createTag
  );

router
  .route("/:id")
  .get(getTagDetails)
  .patch(
    createMulterUpload("tag icon").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    updateTag
  )
  .delete(deleteTag);

router.route("/delete-many").post(deleteManyTags);

module.exports = router;
