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

    await fs.promises.access(finalPath, fs.constants.F_OK).catch((err) => {
      throw new NotFoundError(`Not found file with name ${name}`);
    });
    res.sendFile(finalPath);
  } catch (error) {
    throw error;
  }
};

const handleStreamVideoOptions = async (req, res, next) => {
  const { name } = req.params;

  try {
    // Đường dẫn đến file master.m3u8 cho video cụ thể
    const masterFilePath = path.join(
      assetsPath,
      "video segments",
      "master",
      name,
      "master.m3u8",
    );

    // Kiểm tra xem file có tồn tại không
    await fs.promises.access(masterFilePath, fs.constants.F_OK);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    fs.createReadStream(masterFilePath).pipe(res); // Trả về file master.m3u8 trực tiếp
  } catch (error) {
    next(error);
  }
};

const handleStreamVideo = async (req, res, next) => {
  const { name } = req.params;

  const { type, resolution } = req.query;

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
      await fs.promises.access(m3u8Path, fs.constants.F_OK);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.sendFile(m3u8Path);
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

const handleStreamVideoSegment = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { hsl, resolution } = req.query;

    if (!name) {
      throw new NotFoundError(`Not found file with name ${name}`);
    }
    if (!hsl) {
      throw new BadRequestError("Please provide a hsl value");
    }

    if (!resolution) {
      throw new BadRequestError("Please provide a streaming resolution");
    }

    const hslPath = path.join(
      assetsPath,
      "video segments",
      `${resolution}p`,
      name,
      hsl,
    );
    // check if file is exited
    await fs.promises.access(hslPath, fs.constants.F_OK);

    // create streaming
    res.setHeader("Content-Type", "video/MP2T");
    const fileStream = fs.createReadStream(hslPath);
    fileStream.pipe(res);
  } catch (error) {
    throw error;
  }
};

module.exports = {
  handleViewImage,
  handleStreamVideoOptions,
  handleStreamVideo,
  handleStreamVideoSegment,
};
