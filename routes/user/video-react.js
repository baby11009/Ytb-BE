const express = require("express");
const {
  toggleReact,
  getVideotReactState,
} = require("../../controllers/user/video-react");

const router = express.Router();

router.route("/").post(toggleReact);
router.route("/:videoId").get(getVideotReactState);

module.exports = router;
