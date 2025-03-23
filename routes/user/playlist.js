const express = require("express");
const {
  createPlaylist,
  getPlaylists,
  getPlaylistDetails,
  updatePlaylist,
  deletePlaylist,
  deleteManyPlaylist,
} = require("../../controllers/user/playlist");

const router = express.Router();

router.route("/").get(getPlaylists).post(createPlaylist);

router.post("/delete-many", deleteManyPlaylist);

router
  .route("/:id")
  .get(getPlaylistDetails)
  .patch(updatePlaylist)
  .delete(deletePlaylist);

module.exports = router;
