const CustomAPIError = require("./custom-err");

class InvalidError extends CustomAPIError {
  constructor(errorObj) {
    super();
    this.errorObj = errorObj;
  }
}

module.exports = InvalidError;
