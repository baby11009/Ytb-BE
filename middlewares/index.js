const authMiddleware = require("./authentication");
const errorHandlerMiddleware = require(".//error-handler");
const notFoundMiddleware = require("./not-found");
const createMulterUpload = require("./upload");
const multerErrorHandling = require("./upload-limit-error");
const permissionMiddleware = require("./permission");

module.exports = {
  authMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
  createMulterUpload,
  multerErrorHandling,
  permissionMiddleware,
};
