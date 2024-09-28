const { log } = require("console");
const fs = require("fs");
const { getVideoDurationInSeconds } = require("get-video-duration");

const deleteFile = async (filePath) => {
  try {
    await fs.promises.unlink(filePath); // Deletes the file
    console.log(`File ${filePath} deleted successfully.`);
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err.message);
  }
};

const getVideoDuration = async (filePath) => {
  let duration;
  await getVideoDurationInSeconds(filePath).then((dur) => {
    duration = dur;
  });

  return Math.floor(duration);
};

module.exports = {
  deleteFile,
  getVideoDuration,
};
