const nodemailer = require("nodemailer");
const { clientEmailConfig } = require("../config/nodeMailer");

const clientTransporter = nodemailer.createTransport(clientEmailConfig);

module.exports = {
  clientTransporter,
};
