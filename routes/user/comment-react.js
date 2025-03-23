const express = require("express");

const { toggleCmtReact } = require("../../controllers/user/comment-react");
const router = express.Router();

router.post("/", toggleCmtReact);

module.exports = router;
