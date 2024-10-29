const express = require("express");

const router = express.Router();

const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../middlewares");

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
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { image: 4 });
    },
    createTag
  );

router
  .route("/:id")
  .get(getTagDetails)
  .patch(
    createMulterUpload("tag icon").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { image: 4 });
    },
    updateTag
  )
  .delete(deleteTag);

router.route("/delete-many").post(deleteManyTags);

module.exports = router;
