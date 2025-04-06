const { unsubscribe } = require("../../routes/admin");
const { subscriber } = require("../../redis/instance/notification.pub-sub");

const notificationSubscribe = (socket) => {
  subscriber.subscribe(`user:${socket.user.userId}`, (message) => {
    socket.emit("notification", JSON.parse(message));
  });
};

const notificationUnsubscribe = (socket) => {
  subscriber.unsubscribe(`user:${socket.user.userId}`);
};

const notificationHandler = (socket) => {
  subscriber.subscribe(`user:${socket.user.userId}`, (message) => {
    socket.emit("notification", JSON.parse(message));
  });
  return {
    unsubscribe: () => {
      subscriber.unsubscribe(`user:${socket.user.userId}`);
    },
  };
};

module.exports = notificationHandler;
