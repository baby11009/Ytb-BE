const { BadRequestError } = require("../errors");
const path = require("path");
const { deleteFile } = require("../utils/file");

const fileLimitSizeMiddleware = (req, res, next, limitObject = {}) => {

  if (req.files && Object.keys(req.files).length > 0) {
    const errList = [];
    const fileListPath = [];
    for (const key of Object.keys(req.files)) {
      req.files[key]?.forEach((file) => {
        console.log(file.size)
        if (
          file.mimetype.startsWith("image/") &&
          limitObject[key] &&
          file.size > limitObject[key] * 1024 * 1024
        ) {
          errList.push(key);
        }
        fileListPath.push(file.path);
      });
    }
    if (errList.length > 0) {
      fileListPath.forEach((filePath) => {
        deleteFile(filePath);
      });

      let msg = "";

      errList.forEach((file) => {
        msg = `${msg}
              ${file} cannot exceed ${limitObject[file]}MB.`;
      });

      throw new BadRequestError(` ${msg}`);
    }
  }
  next();
};

module.exports = fileLimitSizeMiddleware;
