const CustomAPIError = require("./custom-err");

class DataFieldError extends CustomAPIError {
  constructor(message) {
    super(message);
    this.type = "DataFieldError";
  }
}

module.exports = DataFieldError;
