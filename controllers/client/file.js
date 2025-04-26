const path = require("path");
const fs = require("fs");
const { NotFoundError, BadRequestError } = require("../../errors");
const sharp = require("sharp");

const assetsPath = path.join(__dirname, "../../assets");

const { addValue, getValue } = require("../../redis/instance/client");
const { generateETag } = require("../../utils/file");

const handleViewImage = async (req, res, fileFolder = "") => {
  try {
    const { name } = req.params;

    if (!name) {
      throw new BadRequestError("Please provide a name");
    }
    const imagePath = path.join(assetsPath, fileFolder, name);

    if (!fs.existsSync(imagePath)) {
      throw new NotFoundError("Image not found");
    }

    const width = req.query.width ? parseInt(req.query.width) : null;
    const height = req.query.height ? parseInt(req.query.height) : null;
    const format = req.query.format || "webp";
    const quality = req.query.quality ? parseInt(req.query.quality) : 80;
    const fit = req.query.fit || "contain";

    // Creating cache key to store in redis base on name & query parameters
    const cacheKey = `img:${name}:${width || "orig"}:${
      height || "orig"
    }:${format}:${quality}:${fit}`;

    const cachedImage = await getValue(cacheKey);

    if (cachedImage) {
      const buffer = Buffer.from(cachedImage, "base64");
      const etag = generateETag(buffer);

      // Check if client has a cached version
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      res.set({
        "Content-Type": `image/${format}`,
        "Cache-Control": "public, max-age=43200",
        ETag: etag,
      });

      return res.send(buffer);
    }

    let imageBuffer = fs.readFileSync(imagePath);
    let processedImage = sharp(imageBuffer);

    // Apply transformations if needed
    if (width || height) {
      processedImage = processedImage.resize({
        width: width,
        height: height,
        fit: fit,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    // Apply format conversion
    switch (format.toLowerCase()) {
      case "jpg":
      case "png":
        processedImage = processedImage.png({ quality });
        res.set("Content-Type", "image/png");
        break;
      case "webp":
        processedImage = processedImage.webp({ quality });
        res.set("Content-Type", "image/webp");
        break;
      case "avif":
        processedImage = processedImage.avif({ quality });
        res.set("Content-Type", "image/avif");
        break;
      default:
        processedImage = processedImage.jpeg({ quality });
        res.set("Content-Type", "image/jpeg");
    }

    // Process image
    const outputBuffer = await processedImage.toBuffer();

    // Generate ETag
    const etag = generateETag(outputBuffer);

    // Check if client has this version cached
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    // Store in Redis cache if available (expire after half day)

    await addValue(cacheKey, outputBuffer.toString("base64"));

    // Set headers for caching and content type
    res.set({
      "Cache-Control": "public, max-age=43200",
      ETag: etag,
    });

    // Stream the processed image
    res.send(outputBuffer);
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

    // check if file exists
    await fs.promises.access(hslPath, fs.constants.F_OK);

    // Handle range request for streaming
    const stat = await fs.promises.stat(hslPath);
    const fileSize = stat.size;

    let start = 0;
    let end = fileSize - 1;

    // If range is specified in request headers, adjust the start and end
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    }

    const contentLength = end - start + 1;

    // Set the necessary headers for range response
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", contentLength);
    res.setHeader("Content-Type", "video/MP2T");

    // Create file stream for the requested range
    const fileStream = fs.createReadStream(hslPath, { start, end });

    // Pipe the stream to the response
    fileStream.pipe(res);

    // Handle stream errors
    fileStream.on("error", (error) => {
      res.status(500).send("Error streaming video: " + error.message);
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleViewImage,
  handleStreamVideoOptions,
  handleStreamVideo,
  handleStreamVideoSegment,
};
