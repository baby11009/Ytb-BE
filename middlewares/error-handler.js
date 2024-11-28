const { StatusCodes } = require("http-status-codes");

const errorHandlerMiddleware = (err, req, res, next) => {
  let customError = {
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || "Something went wrong try again later",
  };

  if (err.name === "ValidationError") {
    const errEntries = Object.entries(err.errors);
    let requiredErrKeys = [];

    let otherErrs = [];
    errEntries.forEach((err) => {
      if (err[1].kind === "required") {
        requiredErrKeys.push(err[0]);
      } else {
        const msg =
          err[1].properties?.message ||
          `${err[0]} just accepted ${err[1].kind}`;
        otherErrs.push(msg);
      }
    });

    let msg = "";

    if (requiredErrKeys.length > 0) {
      msg = `Please provide field: ${requiredErrKeys.join(", ")}. `;
    }

    if (otherErrs.length > 0) {
      msg = `${msg}${otherErrs.join(". ")}`;
    }

    customError.statusCode = 400;
    customError.msg = msg;
  }

  if (err.name === "CastError") {
    customError.statusCode = 400;
    customError.msg = `${err.path} just accepted ${err.kind} type`;
  }
  return res.status(customError.statusCode).json({ msg: customError.msg });
};

module.exports = errorHandlerMiddleware;
