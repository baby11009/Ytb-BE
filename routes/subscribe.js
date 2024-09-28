const express = require("express");
const {
  toggleSubscribe,
  modifySubscribe,
  getSubscriptionState,
} = require("../controllers/subscribe/subscribe");

const router = express.Router();

router.route("/").post(toggleSubscribe);
router.route("/:id").patch(modifySubscribe).get(getSubscriptionState);
module.exports = router;
