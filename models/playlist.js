const mongoose = require("mongoose");
const { BadRequestError, NotFoundError } = require("../errors");

const Playlist = new mongoose.Schema(
  {
    created_user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    title: {
      type: String,
      minLength: 1,
      maxLength: 200,
      set: function (value) {
        switch (this.type) {
          case "watch_later":
            return "Watch Later";
          case "liked":
            return "Liked videos";
          case "history":
            return "History";
          default:
            if (!value) {
              throw new Error('Title is required when type is "playlist"');
            }

            return value;
        }
      },
    },
    itemList: {
      type: Array,
      default: [],
      validate: async function (value) {
        if (!value || value.length === 0) return;

        const Video = mongoose.model("Video");

        const foundedVideos = await Video.aggregate([
          {
            $addFields: {
              _idStr: { $toString: "$_id" },
            },
          },
          { $match: { _idStr: { $in: value } } },
          { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
          {
            $project: {
              missingIds: { $setDifference: [value, "$idsFound"] },
            },
          },
        ]);

        if (foundedVideos.length === 0) {
          throw new NotFoundError(
            `The following videos with id: ${value.join(
              ", ",
            )} could not be found`,
          );
        }

        if (foundedVideos[0]?.missingIds?.length > 0) {
          throw new NotFoundError(
            `The following videos with id: ${foundedVideos[0].missingIds.join(
              ", ",
            )} could not be found`,
          );
        }
      },
    },
    type: {
      type: String,
      enum: {
        values: ["playlist", "watch_later", "liked", "history"],
        message: "${VALUE} is not supported",
      },
      default: "playlist",
    },
    privacy: {
      type: String,
      enum: {
        values: ["private", "public"],
        message: "privacy not suppoting {VALUE}",
      },
      default: "public",
      required: function () {
        return this.type === "playlist"; // Chỉ bắt buộc nếu type là 'playlist'
      },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Playlist", Playlist);
