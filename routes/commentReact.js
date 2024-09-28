const express = require("express");

const router = express.Router();
const { toggleCmtReact } = require("../controllers/cmtReact/cmtReact");

router.route("/").post(toggleCmtReact);


module.exports = router;
