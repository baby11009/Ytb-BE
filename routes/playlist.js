const express = require("express");

const {
  createPlaylist,
  getPlaylists,
  getPlaylistDetails,
  updatePlaylist,
  deletePlaylist,
  deleteManyPlaylist,
} = require("../controllers/playlist/playlist");

const { permissionMiddleware } = require("../middlewares");

const router = express.Router();

router.route("/").get(getPlaylists).post(createPlaylist);

router.route("/delete-many").post(permissionMiddleware, deleteManyPlaylist);

router
  .route("/:id")
  .get(getPlaylistDetails)
  .patch(updatePlaylist)
  .delete(deletePlaylist);

module.exports = router;
