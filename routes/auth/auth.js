const express = require("express");

const router = express.Router();

const {
  register,
  login,
  verifyAccount,
  resendConfirmCode,
  sendConfirmCode,
  sendCode,
  changePassword,
  validOtp,
  resetPassword,
} = require("../../controllers/auth/auth");

router.route("/register").post(register);

router.route("/login").post(login);

router.route("/validate-verify-otp").patch(verifyAccount);

router.route("/send-confirm-code").post(sendConfirmCode);

router.route("/resend-confirmation").post(resendConfirmCode);

router.route("/send-code").post(sendCode);

router.route("/change-password").patch(changePassword);

router.route("/validate-otp").patch(validOtp);

router.route("/reset-password").patch(resetPassword);

module.exports = router;
