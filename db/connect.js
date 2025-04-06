const mongoose = require("mongoose");

const connectDb = async (uri) => {
  try {
    mongoose.connect(uri);
    console.log(`Connect DB ${uri}`);
  } catch (error) {
    console.log("DB connect error: ", error);
  }
};

module.exports = connectDb;
