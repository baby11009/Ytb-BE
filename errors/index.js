const CustomAPIError = require("./custom-err");
const UnauthenticatedError = require("./unauthenticated");
const NotFoundError = require("./not-found");
const BadRequestError = require("./bad-request");
const ForbiddenError = require("./forbidden");
const InternalServerError = require("./internal-server-error");
const InvalidError = require("./invalid-error");
const DataFieldError = require("./data-field-error");

module.exports = {
  CustomAPIError,
  UnauthenticatedError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  DataFieldError,
  InvalidError,
};
