const mongoose = require("mongoose");

const CmtReact = new mongoose.Schema({
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
});


module.exports = mongoose.model("CmtReact", CmtReact);
