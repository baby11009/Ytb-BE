const { publisher } = require("../../redis/instance/notification.pub-sub");
const { Notification } = require("../../models");
const { clientTransporter } = require("../../utils/email");

const {
  emailNotificationQueue,
  realTimeNotificationQueue,
} = require("../../queues/bull.queues");

const sendRealTimeNotification = async ({
  senderId,
  receiverId,
  type,
  videoId,
  cmtId,
  message,
}) => {
  try {
    const data = {
      sender_user_id: senderId,
      receiver_user_id: receiverId,
      type,
      message,
    };

    if (videoId) {
      data.video_id = videoId;
    } else if (cmtId) {
      data.comment_id = cmtId;
    }

    if (type !== "subscription") {
      const notification = await Notification.create(data);

      publisher.publish(`user:${receiverId}`, JSON.stringify(notification));
    } else {
      await realTimeNotificationQueue.add(data);
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
