const express = require("express");

const { createNotification } = require("../../controllers/admin/notification");

const router = express.Router();

router.route("/").post(createNotification);

module.exports = router;
