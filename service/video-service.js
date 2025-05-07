const { Video } = require("../models");
const { deleteFile } = require("../utils/file");
const { sessionWrap } = require("../utils/session");
const { NotFoundError } = require("../errors");
const { VideoValidator } = require("../utils/validate");

const path = require("path");
const videoFolderPath = path.join(__dirname, "../assets/video thumb");

class VideoService {
  async uploadVideo(data) {
    const createdVideo = await sessionWrap(async (session) => {
      const video = await Video.create([data], { session });

      return video;
    });

    return createdVideo;
  }

  async updateVideoDetails(query, data, files, allowedFields) {
    const foundedVideo = await Video.findOne(query);

    if (!foundedVideo) {
      throw new NotFoundError(`Video not found`);
    }

    const updateDatas = await new VideoValidator(
      {
        ...data,
        ...files,
      },
      foundedVideo,
      allowedFields,
    ).getValidatedUpdateData();

    const video = await sessionWrap(async (session) => {
      const video = await Video.updateOne(
        { _id: foundedVideo._id, user_id: foundedVideo.user_id },
        updateDatas,
        { session },
      );

      return video;
    });

    if (files?.thumbnail && files?.thumbnail.length) {
      const imgPath = path.join(videoFolderPath, foundedVideo.thumb);
      deleteFile(imgPath);
    }

    return video;
  }

  async deleteSingleVideo(query) {
    const foundedVideo = await Video.findOne(query).select(
      "_id video thumb stream",
    );

    if (!foundedVideo) {
      throw new NotFoundError(`Not found video with id ${id}`);
    }

    await sessionWrap(async (session) => {
      await Video.deleteOne({ _id: foundedVideo._id }, { session }).setOptions({
        context: {
          foundedVideo,
        },
      });
    });
  }

  async deleteVideos(idArray, additionalQueries) {
    const foundedVideos = await Video.find({
      ...additionalQueries,
      _id: { $in: idArray },
    }).select("_id user_id video thumb stream");

    if (foundedVideos.length < 1) {
      throw new NotFoundError(`Not found any video with these ids: ${idList}`);
    }

    if (foundedVideos.length !== idArray.length) {
      const notFoundedList = [];

      foundedVideos.forEach((video) => {
        if (idArray.includes(video._id.toString())) {
          notFoundedList.push(video._id);
        }
      });

      throw new NotFoundError(
        `Not found any video with these ids: ${notFoundedList.join(", ")}`,
      );
    }

    await sessionWrap(async (session) => {
      await Video.deleteMany({ _id: { $in: idArray } }, { session }).setOptions(
        { context: { foundedVideos } },
      );
    });
  }
}

module.exports = new VideoService();
