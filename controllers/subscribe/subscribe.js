const { User, Subscribe } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../../errors");

const toggleSubscribe = async (req, res) => {
  const { userId } = req.user;

  const { channelId } = req.body;

  if (!channelId) {
    throw new BadRequestError("Please provide a channel id");
  }

  if (userId === channelId) {
    throw new BadRequestError("user Id cannot equal channel Id");
  }

  const channel = await User.findById(req.body.channelId);
  if (!channel) {
    throw new BadRequestError(
      `Not found channel with id ${req.body.channelId}`
    );
  }
  const finalData = {
    subscriber_id: req.body.userId,
    channel_id: req.body.channelId,
  };

  const existingSubscibe = await Subscribe.findOne(finalData);

  let msg;
  let count = 1;

  if (existingSubscibe) {
    await Subscribe.deleteOne({ _id: existingSubscibe._id });
    count = -1;
    msg = "Successfully unsubscribed channel";
  } else {
    await Subscribe.create(finalData);
    msg = "Successfully subscribed channel";
  }

  const user = await User.findByIdAndUpdate(req.body.channelId, {
    $inc: { subscriber: count },
  });

  res.status(StatusCodes.OK).json({ msg });
};

const modifySubscribe = async (req, res) => {
  const { id } = req.params;

  const { notify } = req.body;

  const notifyCode = {
    1: "No notification",
    2: "Notification",
  };

  if (notify === undefined) {
    throw new BadRequestError("Notify field is missing");
  }

  const subscribeModify = await Subscribe.findByIdAndUpdate(
    id,
    { notify },
    { returnDocument: "after" }
  );

  console.log("🚀 ~ subscribeModify:", subscribeModify);

  if (!subscribeModify) {
    throw new BadRequestError(`Not found subscribe with id ${id}`);
  }

  res
    .status(StatusCodes.OK)
    .json({ msg: `Notify changed to ${notifyCode[notify]}` });
};

const getSubscriptionState = async (req, res) => {
  const userId = req.user.userId;
  console.log("🚀 ~ userId:", userId);

  const { id: channelId } = req.params;

  if (!channelId) {
    throw new BadRequestError("Please provide a channel ID");
  }

  if (userId === channelId) {
    throw new BadRequestError("user Id cannot equal channel Id");
  }

  const channel = await User.findById(channelId);
  if (!channel) {
    throw new BadRequestError(`Not found channel with id ${channelId}`);
  }

  const state = await Subscribe.findOne({
    subscriber_id: userId,
    channel_id: channelId,
  });

  let result = {
    state: false,
  };

  if (state) {
    (result.state = true), (result.info = state);
  }

  res.status(StatusCodes.OK).json({ data: result });
};

module.exports = { toggleSubscribe, modifySubscribe, getSubscriptionState };
