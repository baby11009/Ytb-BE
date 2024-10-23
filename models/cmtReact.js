const mongoose = require("mongoose");

const CmtReactSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide user id"],
    },
    cmt_id: {
      type: mongoose.Types.ObjectId,
      required: [true, "Please provide comment id"],
    },
    type: {
      type: String,
      enum: ["like", "dislike"],
      required: [true, "Please provide comment's react type"],
    },
  },
  { timestamps: true }
);

CmtReactSchema.pre("deleteMany", async function () {
  const { user_id } = this.getQuery();
  // Just do all of the work when is is cascade deleting when deleting user
  if (user_id) {
    const CmtReact = mongoose.model("CmtReact");
    const Comment = mongoose.model("Comment");
    const foundedCmtReacts = await CmtReact.find({ user_id });

    // Update the comment like and dislike count of the comment that user has reacted to
    foundedCmtReacts.forEach(async (cmtReact) => {
      let updateObject = { $inc: { like: -1 } };
      if (cmtReact.type === "dislike") {
        updateObject = { $inc: { dislike: -1 } };
      }
      await Comment.updateOne({ _id: cmtReact.cmt_id }, updateObject);
    });
  }
});
module.exports = mongoose.model("CmtReact", CmtReactSchema);
