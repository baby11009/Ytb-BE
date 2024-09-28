const express = require("express");

const router = express.Router();

const { createMulterUpload, multerErrorHandling } = require("../middlewares");

const {
  upLoadVideo,
  getVideos,
  getVideoDetails,
  updateVideo,
  deleteVideo,
  deleteManyVideos,
} = require("../controllers/video/video");

const { authMiddleware } = require("../middlewares");

router.post(
  "/upload",
  authMiddleware,
  createMulterUpload("video thumb", "videos").fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  multerErrorHandling,
  upLoadVideo
);

router.route("/").get(getVideos);

router.route("/delete-many").post(authMiddleware, deleteManyVideos);

router
  .route("/:id")
  .delete(authMiddleware, deleteVideo)
  .get(getVideoDetails)
  .patch(
    authMiddleware,
    createMulterUpload("video thumb").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    updateVideo
  );

module.exports = router;
