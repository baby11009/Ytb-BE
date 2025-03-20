// Utility functions for type validation
const { BadRequestError } = require("../errors");
const validators = {
  isString: (value, fieldName) => {
    if (typeof value !== "string") {
      throw new BadRequestError(`${fieldName} must be a string`);
    }
    return true;
  },

  isBoolean: (value, fieldName) => {
    if (typeof value !== "boolean") {
      throw new BadRequestError(`${fieldName} must be a boolean`);
    }
    return true;
  },

  isNumber: (value, fieldName) => {
    if (typeof value !== "number" || isNaN(value)) {
      throw new BadRequestError(`${fieldName} must be a number`);
    }
    return true;
  },

  isArray: (value, fieldName) => {
    if (!Array.isArray(value)) {
      throw new BadRequestError(`${fieldName} must be an array`);
    }
    return true;
  },

  isEnum: (value, allowedValues, fieldName) => {
    if (!allowedValues.includes(value)) {
      throw new BadRequestError(
        `${fieldName} must be one of: ${allowedValues.join(", ")}`,
      );
    }
    return true;
  },

  isNotTheSame: (value1, value2, fieldName) => {
    if (value1 === value2) {
      throw new BadRequestError(`${fieldName} must not be the same`);
    }
    return true;
  },
};

module.exports = {
  validators,
};
