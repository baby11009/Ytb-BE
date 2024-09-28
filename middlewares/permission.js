const { ForbiddenError } = require("../errors");
const permission = async (req, res, next) => {
  const user = req.user;

  if (user.role !== "admin") {
    throw new ForbiddenError(
      "Your role are not allowed to perform this action"
    );
  }

  next();
};

module.exports = permission;
