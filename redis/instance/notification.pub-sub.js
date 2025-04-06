const redis = require("redis");

const publisher = redis.createClient();
const subscriber = redis.createClient();

module.exports = {
  publisher,
  subscriber,
};
