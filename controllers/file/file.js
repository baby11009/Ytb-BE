const path = require("path");
const fs = require("fs");
const { NotFoundError, BadRequestError } = require("../../errors");

const assetsPath = path.join(__dirname, "../../assets");

const handleViewImage = async (req, res, fileFolder = "") => {
  try {
    const { name } = req.params;

    if (!name) {
      throw new BadRequestError("Please provide a name");
    }

    const finalPath = path.join(assetsPath, fileFolder, name);

    try {
      await fs.promises.access(finalPath, fs.constants.F_OK);
      res.sendFile(finalPath);
    } catch (err) {
      throw new NotFoundError(`Not found file with name ${name}`);
    }
  } catch (error) {
    throw err;
  }
};

const handleViewVideo = async (req, res, next) => {
  const { name } = req.params;

  const { type, resolution } = req.query;
  console.log(type);
  try {
    if (!name) {
      throw new BadRequestError("Please provide a name");
    }

    if (!type) {
      throw new BadRequestError("Please provide a type");
    }

    if (type === "stream") {
      if (!resolution) {
        throw new BadRequestError("Please provide a  streaming resolution");
      }
      const m3u8Path = path.join(
        assetsPath,
        "video segments",
        `${resolution}p`,
        name,
        "hsl_output.m3u8",
      ); // Đường dẫn tới file .m3u8

      // Kiểm tra xem file .m3u8 có tồn tại không
      fs.access(m3u8Path, fs.constants.F_OK, (err) => {
        if (err) {
          // Nếu không tồn tại, trả về lỗi
          return next(new Error(`M3U8 file not found: ${name}`));
        }

        // Nếu tồn tại, đọc và gửi file .m3u8
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.sendFile(m3u8Path);
      });
    } else {
      const videoPath = path.join(assetsPath, "videos", name);
      await fs.promises.access(videoPath, fs.constants.F_OK);
      const videoStat = fs.statSync(videoPath);
      const fileSize = videoStat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": "video/mp4",
        };

        res.writeHead(206, head); // Status code 206 for Partial Content
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        };

        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new NotFoundError(`Not found file with name ${name}`);
    } else {
      throw error;
    }
  }
};

module.exports = {
  handleViewImage,
  handleViewVideo,
};
