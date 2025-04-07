const { User, Subscribe } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} = require("../../errors");

const {
  sendRealTimeNotification,
} = require("../../service/notification/notification");
const { sessionWrap } = require("../../utils/session");

const subscribe = async (req, res) => {
  const { userId, name } = req.user;

  const { channelId } = req.body;

  if (!channelId) {
    throw new BadRequestError("Please provide a channel id");
  }

  if (userId === channelId) {
    throw new BadRequestError("You cannot subscribe to your own channel");
  }

  const channel = await User.findById(channelId);

  if (!channel) {
    throw new BadRequestError(`Not found channel with id ${channelId}`);
  }

  const finalData = {
    subscriber_id: userId,
    channel_id: channelId,
  };

  const subscription = await Subscribe.findOne(finalData);

  if (subscription) {
    throw new BadRequestError("You have already subscribed this channel");
  }

  try {
    const subscription = await sessionWrap(async (session) => {
      const subscription = await Subscribe.create([finalData], { session });

      return subscription;
    });

    sendRealTimeNotification({
      senderId: userId,
      receiverId: channelId,
      type: "content",
      message: `${name} has subcribed to your channel`,
    });

    res.status(StatusCodes.OK).json({
      message: "Successfully subscribed channel",
      data: {
        _id: subscription[0]._id,
        notify: subscription[0].notify,
      },
    });
  } catch (error) {
    console.log("User create subscription error: ", error);
    throw new InternalServerError(
      `Failed to subscribe to channel with email ${email}`,
    );
  }
};

const unsubscribe = async (req, res) => {
  const { userId } = req.user;

  const { channelId } = req.params;

  if (!channelId) {
    throw new BadRequestError("Please provide a channel id");
  }

  const channel = await User.findById(channelId);

  if (!channel) {
    throw new BadRequestError(`Not found channel with id ${channelId}`);
  }

  const finalData = {
    subscriber_id: userId,
    channel_id: channelId,
  };

  const subscription = await Subscribe.findOne(finalData);

  try {
    if (!subscription) {
      throw new NotFoundError(
        `Not found subscription with channel id ${channelId}`,
      );
    }

    await sessionWrap(async (session) => {
      await Subscribe.deleteOne(
        { _id: subscription._id, channel_id: channelId },
        { session },
      );
    });

    res.status(StatusCodes.OK).json({
      message: "Successfully unsubscribed channel",
    });
  } catch (error) {
    console.error("User delete supscription error: ", error);
    throw new InternalServerError(`Failed to unsubscribe to channel`);
  }
};

const modifySubscribe = async (req, res) => {
  const { userId } = req.user;

  const { id } = req.params;

  const { notify } = req.body;

  const notifyCode = {
    1: "No notification",
    2: "Notification",
  };

  if (notify === undefined) {
    throw new BadRequestError("Notify field is missing");
  }

  const foundedSubribe = await Subscribe.findOne({
    _id: id,
    subscriber_id: userId,
  });

  if (!foundedSubribe) {
    throw new NotFoundError(`Not found subscription with id ${id}`);
  }

  const subscribeModify = await Subscribe.findByIdAndUpdate(
    id,
    { notify },
    { returnDocument: "after" },
  );

  if (!subscribeModify) {
    throw new InternalServerError(`Failed to update subscription`);
  }

  res.status(StatusCodes.OK).json({
    msg: `Notify changed to ${notifyCode[notify]}`,
    data: subscribeModify,
  });
};

const getSubscriptionState = async (req, res) => {
  const { userId } = req.user;

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

module.exports = {
  subscribe,
  unsubscribe,
  modifySubscribe,
  getSubscriptionState,
};
