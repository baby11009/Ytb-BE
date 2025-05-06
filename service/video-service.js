const { Video } = require("../models");
const { deleteFile } = require("../utils/file");
const { sessionWrap } = require("../utils/session");
const { NotFoundError } = require("../errors");
const { UserValidator, Validator } = require("../utils/validate");

const path = require("path");
const avatarPath = path.join(__dirname, "../assets/user avatar");

class VideoService {
  async uploadVideo(data) {
    await sessionWrap(async (session) => {
      await Video.create([data], { session });
    });
  }
}

module.exports = new VideoService();
