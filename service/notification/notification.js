const { publisher } = require("../../redis/instance/notification.pub-sub");
const { Notification } = require("../../models");
const { clientTransporter } = require("../../utils/email");

const {
  emailNotificationQueue,
  realTimeNotificationQueue,
} = require("../../queues/bull.queues");

const sendRealTimeNotification = async (userId, type, message) => {
  try {
    if (type !== "subscription") {
      const notification = await Notification.create({ userId, type, message });
      publisher.publish(`user:${userId}`, JSON.stringify(notification));
    } else {
      await realTimeNotificationQueue.add({ userId, type, message });
    }
  } catch (error) {
    console.error(error);
  }
};

const sendEmailNotification = async (email, subject, content) => {
  try {
    await clientTransporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: subject,
      html: content,
    });
  } catch (error) {
    console.log(error);
    await emailNotificationQueue
      .add({ email, subject, content }, { attempts: 3, backoff: 5000 })
      .then(() => {
        console.log("job added");
      });
  }
};

module.exports = {
  sendRealTimeNotification,
  sendEmailNotification,
};
