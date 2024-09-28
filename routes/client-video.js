const express = require("express");
const { getVideo } = require("../controllers/video/client-video");
const router = express.Router();

router.route("/:id").get(getVideo);

module.exports = router;
