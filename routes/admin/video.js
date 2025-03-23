const express = require("express");

const router = express.Router();

const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../../middlewares");

const {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
} = require("../../controllers/admin/video");

router.post(
  "/upload",
  createMulterUpload("video thumb", "videos", 2).fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  multerErrorHandling,
  async (req, res, next) => {
    fileLimitSizeMiddleware(req, res, next, { thumbnail: 2 });
  },
  upLoadVideo,
);

router.route("/").get(getVideos);

router.route("/delete-many").delete(deleteManyVideos);

router
  .route("/:id")
  .delete(deleteVideo)
  .get(getVideoDetails)
  .patch(
    createMulterUpload("video thumb", undefined).fields([
      { name: "thumbnail", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, {
        thumbnail: 2,
      });
    },
    updateVideo,
  );

module.exports = router;
