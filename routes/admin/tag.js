const express = require("express");

const router = express.Router();

const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../../middlewares");

const {
  createTag,
  getTags,
  getTagDetails,
  updateTag,
  deleteTag,
  deleteManyTags,
} = require("../../controllers/admin/tag.js");

router
  .route("/")
  .get(getTags)
  .post(
    createMulterUpload("tag icon").fields([{ name: "icon", maxCount: 1 }]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { icon: 2 });
    },
    createTag,
  );

router.route("/delete-many").delete(deleteManyTags);

router
  .route("/:id")
  .get(getTagDetails)
  .patch(
    createMulterUpload("tag icon").fields([{ name: "icon", maxCount: 1 }]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { icon: 2 });
    },
    updateTag,
  )
  .delete(deleteTag);

module.exports = router;
