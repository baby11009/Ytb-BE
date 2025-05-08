const { Playlist } = require("../models");
const { deleteFile } = require("../utils/file");
const { sessionWrap } = require("../utils/session");
const { NotFoundError, InternalServerError } = require("../errors");
const { PlaylistValidator } = require("../utils/validate");

const path = require("path");
const iconPath = path.join(__dirname, "../assets/tag icon");

class PlaylistService {
  async createPlaylistService(userId, data) {
    const { title, videoIdList = [], privacy } = data;

    const playlist = await Playlist.create({
      created_user_id: userId,
      title,
      type: "playlist",
      privacy,
      itemList: videoIdList,
    });

    return playlist;
  }

  async updatePlaylistService(queries, data) {
    const foundedPlaylist = await Playlist.findOne(queries);

    if (!foundedPlaylist) {
      throw new NotFoundError("Playlist not found");
    }

    const bulkWrites = await new PlaylistValidator(
      data,
      foundedPlaylist,
    ).getValidatedUpdateData();

    await sessionWrap(async (session) => {
      await Playlist.bulkWrite(bulkWrites, { session });
    });
  }

  async deletePlaylistService(playlistId, additionalQueries) {
    const playlist = await Playlist.findOne({
      _id: playlistId,
      ...additionalQueries,
    });

    if (!playlist) {
      throw new NotFoundError(`Playlist not found`);
    }

    if (playlist.type !== "playlist") {
      throw new ForbiddenError("You can't delete this list");
    }

    await Playlist.deleteOne({ _id: playlistId });
  }

  async deleteManyPlaylistService(idArray, additionalQueries) {
    const foundedPlaylists = await Playlist.find({
      _id: { ...additionalQueries, $in: idArray },
    }).select("_id type");

    if (foundedPlaylists.length === 0) {
      throw new NotFoundError(`No playlists matched the provided IDs`);
    }

    if (foundedPlaylists.length !== idArray.length) {
      const notFoundedList = [];

      foundedPlaylists.forEach((user) => {
        if (idArray.includes(user._id.toString())) {
          notFoundedList.push(user._id);
        }
      });

      throw new NotFoundError(
        `No playlist found with these ids : ${notFoundedList.join(", ")}`,
      );
    }

    const specialList = foundedPlaylists.filter((playlist) => {
      if (playlist.type !== "playlist") {
        return playlist._id.toString();
      }
    });

    if (specialList.length > 0) {
      throw new ForbiddenError(
        `You can't delete these playlists with id ${specialList.join(", ")}`,
      );
    }

    await Playlist.deleteMany({ _id: { $in: idArray } });
  }
}

module.exports = new PlaylistService();
