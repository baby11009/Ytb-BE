const express = require("express");

const {
  subscribe,
  unsubscribe,
  modifySubscribe,
  getSubscriptionState,
} = require("../../controllers/user/subscription");

const router = express.Router();

router.route("/").post(subscribe);
router.route("/:channelId").delete(unsubscribe);
router.route("/:id").patch(modifySubscribe).get(getSubscriptionState);

module.exports = router;
