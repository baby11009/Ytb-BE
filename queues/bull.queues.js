const Bull = require("bull");
const {
  sendEmail,
  createSubscriptionNotification,
} = require("../jobs/bull.jobs");
const emailNotificationQueue = new Bull("emailNotifications", {
  redis: { host: "127.0.0.1", port: 6379 },
});

const realTimeNotificationQueue = new Bull("realTimeNotifications", {
  redis: { host: "127.0.0.1", port: 6379 },
});

emailNotificationQueue
  .isReady()
  .then(() => {
    console.log("Bull email is connected to Redis");
  })
  .catch((error) => {
    console.error("Bull is not connected to Redis", error);
  });

realTimeNotificationQueue
  .isReady()
  .then(() => {
    console.log("Bull realtime is  connected to Redis");
  })
  .catch((error) => {
    console.error("Bull is not connected to Redis", error);
  });

emailNotificationQueue.process(async (jobData) => {
  await sendEmail(jobData);
});

realTimeNotificationQueue.process(async (job) => {
  await createSubscriptionNotification(job);
});

module.exports = {
  emailNotificationQueue,
  realTimeNotificationQueue,
};
