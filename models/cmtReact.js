const mongoose = require("mongoose");
const Comment = require("./comment");
const CmtReact = new mongoose.Schema(
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
  { timestamps: true },
);

CmtReact.pre("deleteMany", async function () {
  const { user_id } = this.getQuery();
  const { session } = this.options;
  if (!session) {
    throw new Error("⚠️ Transaction session is required");
  }
  // Just do all of the work when it is cascade deleting when deleting user
  if (user_id) {
    const CmtReact = mongoose.model("CmtReact");
    const Comment = mongoose.model("Comment");
    const foundedCmtReacts = await CmtReact.find({ user_id }, { session });

    // Update the comment like and dislike count of the comment that user has reacted to
    foundedCmtReacts.forEach(async (cmtReact) => {
      let updateObject = { $inc: { like: -1 } };
      if (cmtReact.type === "dislike") {
        updateObject = { $inc: { dislike: -1 } };
      }
      await Comment.updateOne({ _id: cmtReact.cmt_id }, updateObject, {
        session,
      });
    });
  }
});
module.exports = mongoose.model("CmtReact", CmtReact);
