const express = require("express");
const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../../middlewares");

const router = express.Router();

const {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
} = require("../../controllers/user/video");

router.post(
  "/upload",
  createMulterUpload("video thumb", "videos").fields([
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

router.route("/delete-many").post(deleteManyVideos);

router
  .route("/:id")
  .delete(deleteVideo)
  .get(getVideoDetails)
  .patch(
    createMulterUpload("video thumb").fields([
      { name: "thumbnail", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { thumbnail: 2 });
    },
    updateVideo,
  );

module.exports = router;
