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
  try {
    console.log(job.data);
    const notification = await Notification.create(job.data);

    publisher.publish(
      `user:${job.data.receiver_user_id}`,
      JSON.stringify(notification),
    );
  } catch (error) {
    console.error("Bull notification job error: ", error);
  }
};

module.exports = { sendEmail, createSubscriptionNotification };
