const authMiddleware = require("./authentication");
const errorHandlerMiddleware = require(".//error-handler");
const notFoundMiddleware = require("./not-found");
const createMulterUpload = require("./upload");
const multerErrorHandling = require("./upload-error-handler");
const permissionMiddleware = require("./permission");
const fileLimitSizeMiddleware = require("./upload-limit-size");
const getAccountInfoMiddleware = require("./get-account-info");
const requestOriginChecker = require("./request-origin-checker");

module.exports = {
  authMiddleware,
  requestOriginChecker,
  errorHandlerMiddleware,
  notFoundMiddleware,
  createMulterUpload,
  multerErrorHandling,
  permissionMiddleware,
  fileLimitSizeMiddleware,
  getAccountInfoMiddleware,
};
