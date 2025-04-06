const { clientTransporter } = require("../utils/email");
const { Notification } = require("../models");
const { publisher } = require("../redis/instance/notification.pub-sub");

const sendEmail = async (job) => {
  const { email, subject, content } = job.data;

  await clientTransporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: subject,
    html: content,
  });
};

const createSubscriptionNotification = async (job) => {
  const { userId, type, message } = job.data;

  const notification = await Notification.create({ userId, type, message });
  publisher.publish(`user:${userId}`, JSON.stringify(notification));
};

module.exports = { sendEmail, createSubscriptionNotification };
