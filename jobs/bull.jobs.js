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
  const { senderId, receiverId, type, message } = job.data;

  const data = {
    sender_user_id: senderId,
    receiver_user_id: receiverId,
    type,
    message,
  };

  try {
    const notification = await Notification.create(job.data);

    publisher.publish(`user:${receiver_user_id}`, JSON.stringify(notification));
  } catch (error) {
    console.error("Bull notification job error: ", error);
  }
};

module.exports = { sendEmail, createSubscriptionNotification };
