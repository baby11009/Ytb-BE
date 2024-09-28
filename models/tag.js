const mongoose = require("mongoose");

const Tag = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide a title for the tag"],
      unique: true,
      minLength: 3,
      maxLength: 50,
    },
    icon: {
      type: String,
      required: [true, "Please provide an icon for the tag"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tag", Tag);
