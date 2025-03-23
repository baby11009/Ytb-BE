const mongoose = require("mongoose");

const Tag = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide a title for the tag"],
      unique: true,
      minLength: 3,
      maxLength: 30,
      unique: true,
    },
    slug: {
      type: String,
      required: [true, "Please provide an slug for the tag"],
      unique: true,
    },
    icon: {
      type: String,
      required: [true, "Please provide an icon for the tag"],
    },
  },
  { timestamps: true },
);

Tag.pre(["findOneAndUpdate", "updateOne"], function () {
  const update = this.getUpdate();

  if (update.title) {
    this.setUpdate({
      ...update,
      slug: update.title.toLowerCase().replace(/[^\w]+/g, "-"),
    });
  }
  
});

module.exports = mongoose.model("Tag", Tag);
