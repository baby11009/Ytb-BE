const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendEmailConfirm = async (email, subject, content) => {
  return await transporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: subject,
    html: content,
  });
};

module.exports = {
  sendEmailConfirm,
};
