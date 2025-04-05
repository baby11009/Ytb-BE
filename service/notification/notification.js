const nodemailer = require("nodemailer");
const Bull = require("bull");
const { publisher } = require("./redis");
const { Notification } = require("../../models");

const notificationQueue = new Bull("notifications", {
  redis: { host: "127.0.0.1", port: 6379 },
});

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

const sendRealTimeNotification = async (userId, type, message) => {
  try {
    const notification = await Notification.create({ userId, type, message });
    publisher.publish(`user:${userId}`, JSON.stringify(notification));
  } catch (error) {
    console.error(error);
  }
};

const sendEmailNotification = async (email, subject, content) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: subject,
      html: content,
    });
  } catch (error) {
    await notificationQueue.add(
      { email, subject, content },
      { attempts: 3, backoff: 5000 },
    );
  }
};

notificationQueue.process(async (jobData) => {
  const { email, subject, content } = jobData;
  await transporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: subject,
    html: content,
  });
});

module.exports = {
  sendRealTimeNotification,
  sendEmailNotification,
};
