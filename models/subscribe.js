const mongoose = require("mongoose");

const Subscribe = new mongoose.Schema(
  {
    subscriber_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    channel_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide channel id"],
    },
    notify: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

Subscribe.pre("deleteOne", async function () {
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("Session is required");
  }
  const { _id } = this.getQuery();

  try {
    const User = mongoose.model("User");
    const Subscribe = mongoose.model("Subscribe");

    const foundedSubscription = await Subscribe.findById(_id);
    if (!foundedSubscription) {
      throw new Error(`Not found subscription with id ${_id} `);
    }
    await User.updateOne(
      { _id: foundedSubscription.channel_id },
      { $inc: { subscriber: -1 } },
      { session },
    );
  } catch (error) {
    throw error;
  }
});

Subscribe.pre("deleteMany", async function () {
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("Session is required");
  }
  const User = mongoose.model("User");

  const Subscribe = mongoose.model("Subscribe");

  const { subscriber_id } = this.getQuery();

  try {
    if (subscriber_id) {
      const foundedSubscriptions = await Subscribe.find({
        subscriber_id: subscriber_id,
      });

      if (foundedSubscriptions.length < 1) {
        throw new Error(`Not found any subscriptions for ${subscriber_id}`);
      }

      await Promise.all(
        foundedSubscriptions.map((subcription) =>
          User.updateOne(
            { _id: subcription.channel_id },
            { $inc: { subscriber: -1 } },
            { session },
          ),
        ),
      );
    }
  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("Subscribe", Subscribe);
