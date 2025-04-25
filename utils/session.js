const mongoose = require("mongoose");
const sessionWrap = async (cb) => {
  const session = await mongoose.startSession();

  session.startTransaction();

  try {
    const result = await cb(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  sessionWrap,
};
