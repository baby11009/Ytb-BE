const { createMulterUpload, multerErrorHandling } = require("../middlewares");

const express = require("express");

const {
  getAccountInfo,
  getAccountSubscribedChannel,
  settingAccount,
} = require("../controllers/user/client-user");

const router = express.Router();

router.patch(
  "/:id",
  createMulterUpload("user avatar", 0).fields([{ name: "image", maxCount: 1 }]),
  multerErrorHandling,
  settingAccount
);

router.get("/me", getAccountInfo);
router.get("/subscribe-channels", getAccountSubscribedChannel);

module.exports = router;
