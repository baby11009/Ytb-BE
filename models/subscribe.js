const mongoose = require("mongoose");

const SubscribeSchema = new mongoose.Schema(
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

SubscribeSchema.post("save", async function (req, res) {
  const session = this.$session();

  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }
  const User = mongoose.model("User");

  await User.updateOne(
    { _id: this.channel_id },
    { $inc: { subscriber: 1 } },
    { session },
  );
});

SubscribeSchema.pre("deleteOne", async function () {
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("Session is required");
  }
  const { _id, channel_id } = this.getQuery();

  try {
    const User = mongoose.model("User");
    const Subscribe = mongoose.model("Subscribe");
    let foundedSubscription;
    if (!channel_id) {
      console.log("5");
      foundedSubscription = await Subscribe.findById(_id);
      if (!foundedSubscription) {
        throw new Error(`Not found subscription with id ${_id} `);
      }
    }

    await User.updateOne(
      { _id: channel_id || foundedSubscription.channel_id },
      { $inc: { subscriber: -1 } },
      { session },
    );
  } catch (error) {
    throw error;
  }
});

SubscribeSchema.pre("deleteMany", async function () {
  const { session } = this.getOptions();

  if (!session) {
    throw new Error("Session is required");
  }
  const User = mongoose.model("User");

  const Subscribe = mongoose.model("Subscribe");

  const { subscriber_id } = this.getQuery();

  if (subscriber_id) {
    const foundedSubscriptions = await Subscribe.find({
      subscriber_id: subscriber_id,
    });

    if (foundedSubscriptions.length > 0) {
      const bulkOps = foundedSubscriptions.map((subcription) => ({
        updateOne: {
          filter: { _id: subcription.channel_id },
          update: { $inc: { subscriber: -1 } },
        },
      }));

      await User.bulkWrite(bulkOps, { session });
    }
  }
});

module.exports = mongoose.model("Subscribe", SubscribeSchema);
