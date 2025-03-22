const multer = require("multer");
const path = require("path");
const fs = require("fs");

const assetsPath = path.join(__dirname, "../assets");

const fileFilter = (req, file, cb) => {
  const validImageFieldNames = ["image", "thumbnail", "banner", "avatar"];
  if (
    validImageFieldNames.includes(file.fieldname) &&
    file.mimetype.startsWith("image/")
  ) {
    cb(null, true);
  } else if (file.fieldname === "video" && file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error(`Only accepted image or video file`), false);
  }
};

function createMulterUpload(imageDes, videoDes) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (
        (file.mimetype.startsWith("image/") ||
          file.mimetype.startsWith("image/")) &&
        imageDes
      ) {
        const imgPath = path.join(assetsPath, imageDes);
        cb(null, imgPath);
      } else if (file.mimetype.startsWith("video/") && videoDes) {
        const videoPath = path.join(assetsPath, videoDes);
        cb(null, videoPath);
      }
    },
    filename: (req, file, cb) => {
      cb(
        null,
        path.basename(file.originalname, path.extname(file.originalname)) +
          "_" +
          Date.now() +
          path.extname(file.originalname),
      );
    },
  });

  return multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
      return fileFilter(req, file, cb);
    },
  });
}

module.exports = createMulterUpload;
