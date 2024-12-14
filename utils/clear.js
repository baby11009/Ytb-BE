// function to clean up all the file that were uploaded and created when user uploaded new video
const {
  deleteFile,
  deleteFolder,
  deleteFolderWithSameName,
} = require("./file");
const path = require("path");

const clearUploadedVideoFiles = async (args) => {
  const deleteFunc = {
    videoPath: (videoPath) => {
      deleteFile(videoPath);
    },

    imagePath: (imagePath) => {
      deleteFile(imagePath);
    },
    streamInfo: (streamInfo) => {
      if (streamInfo) {
        const { masterFolderPath, videoSegmentInfos } = streamInfo;
        if (masterFolderPath) {
          deleteFolder(masterFolderPath);
        }
        for (const videoSegmentInfo of videoSegmentInfos) {
          deleteFolder(videoSegmentInfo.folderPath);
        }
      }
    },
    streamFolderName: (streamFolderName) => {
      const segmentPath = path.join(__dirname, "../assets/video segments");

      deleteFolderWithSameName(segmentPath, streamFolderName);
    },
  };

  for (const [key, value] of Object.entries(args)) {
    if (deleteFunc[key] && value) {
      deleteFunc[key](value);
    }
  }
};

module.exports = {
  clearUploadedVideoFiles,
};
