const fluentFFmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const asssetPath = path.join(__dirname, "../assets");

async function createHls(filename, videoPath, type) {
  const resolutions = [
    {
      quality: 1080,
      resolution: {
        video: {
          width: 1920,
          height: 1080,
        },
        short: {
          width: 1080,
          height: 1920,
        },
      },
      bitrate: 5000,
      maxrate: 6000,
      bufsize: 12000,
    },
    {
      quality: 720,
      resolution: {
        video: {
          width: 1280,
          height: 720,
        },
        short: {
          width: 720,
          height: 1280,
        },
      },
      bitrate: 3000,
      maxrate: 4000,
      bufsize: 8000,
    },
    // {
    //   quality: 480,
    //   scaleVideo: "scale=854:480",
    //   scaleShort: "scale=270:480",
    //   resolution: {
    //     video: {
    //       width: 854,
    //       height: 480,
    //     },
    //     short: {
    //       width: 480,
    //       height: 854,
    //     },
    //   },
    //   bitrate: 1500,
    //   maxrate: 2000,
    //   bufsize: 4000,
    // },
    // {
    //   quality: 360,
    //   scaleVideo: "scale=640:360",
    //   scaleShort: "scale=:203:360",
    //   resolution: {
    //     video: {
    //       width: 640,
    //       height: 360,
    //     },
    //     short: {
    //       width: 360,
    //       height: 640,
    //     },
    //   },
    //   bitrate: 800,
    //   maxrate:1000,
    //   bufsize: 2000,
    // },
  ];

  const outputDir = "video segments";

  const videoSegmentInfos = [];

  resolutions.forEach((resolution) => {
    const folderPath = path.join(
      asssetPath,
      outputDir,
      `${resolution.quality}p`,
      filename,
    );

    const filePath = path.join(folderPath, "hsl_output.m3u8");
    let result = {
      folderPath,
      filePath,
      quality: resolution.quality,
      bitrate: resolution.bitrate,
      maxrate: resolution.maxrate,
      bufsize: resolution.bufsize,
    };
    switch (type) {
      case "video":
        result = {
          ...result,
          width: resolution.resolution.video.width,
          height: resolution.resolution.video.height,
        };
        break;
      case "short":
        result = {
          ...result,
          width: resolution.resolution.short.width,
          height: resolution.resolution.short.height,
        };
        break;
      default:
        throw new BadRequestError("Invalid video type");
    }
    videoSegmentInfos.push(result);
  });

  let ffmpeg = fluentFFmpeg(videoPath);
  let ffmpeg2 = fluentFFmpeg(videoPath);

  const segmentBaseUrl = "http://localhost:3000/api/v1/file/segment/";

  const masterFolderPath = path.join(asssetPath, outputDir, "master", filename);

  const masterFilePath = path.join(masterFolderPath, "master.m3u8");

  for (const videoSegmentInfo of videoSegmentInfos) {
    fs.mkdirSync(videoSegmentInfo.folderPath);
    const fd = fs.openSync(videoSegmentInfo.filePath, "w+");
    fs.closeSync(fd);
    if (
      videoSegmentInfos.indexOf(videoSegmentInfo) !== 0 &&
      videoSegmentInfos.length > 1
    ) {
      const segmentSafeBaseUrl = encodeURI(
        segmentBaseUrl +
          filename +
          `?resolution=${videoSegmentInfo.quality}&hsl=`,
      );
      ffmpeg2
        .output(videoSegmentInfo.filePath) //scale=480:854
        .videoFilters(
          `scale=${videoSegmentInfo.width + ":" + videoSegmentInfo.height}`,
        )
        .outputOptions([
          "-f hls",
          `-b:v ${videoSegmentInfo.bitrate}k`, // Set average bitrate
          `-maxrate ${videoSegmentInfo.maxrate}k`, // Set max bitrate
          `-bufsize ${videoSegmentInfo.bufsize}k`, // Set buffer size
          "-hls_time 10",
          "-hls_list_size 0",
          "-start_number 1",
          `-hls_base_url ${segmentSafeBaseUrl}`,
        ]);
    }
  }

  const videoBaseUrl = "http://localhost:3000/api/v1/file/video/";

  const segmentSafeBaseUrl = encodeURI(
    segmentBaseUrl +
      filename +
      `?resolution=${videoSegmentInfos[0].quality}&hsl=`,
  );

  // Creating default resolution
  await new Promise((resolve, reject) => {
    ffmpeg
      .output(videoSegmentInfos[0].filePath)
      .videoFilters(
        `scale=${
          videoSegmentInfos[0].width + ":" + videoSegmentInfos[0].height
        }`,
      )
      .outputOptions([
        "-f hls",
        `-b:v ${videoSegmentInfos[0].bitrate}k`, // Set average bitrate
        `-maxrate ${videoSegmentInfos[0].maxrate}k`, // Set max bitrate
        `-bufsize ${videoSegmentInfos[0].bufsize}k`, // Set buffer size
        "-hls_time 10",
        "-hls_list_size 0",
        "-start_number 1",
        `-hls_base_url ${segmentSafeBaseUrl}`,
      ])
      .on("stderr", (stderr) => {
        console.error("FFmpeg stderr:", stderr);
      })
      .on("stdout", (stdout) => {
        console.log("FFmpeg stdout:", stdout);
      })
      .on("end", () => {
        try {
          fs.mkdirSync(masterFolderPath);
          const fd = fs.openSync(masterFilePath, "w+");
          fs.closeSync(fd);

          let masterPlaylistContent =
            "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:1\n";

          const playlistUrl = encodeURI(
            videoBaseUrl +
              filename +
              "?type=stream&resolution=" +
              videoSegmentInfos[0].quality,
          );

          masterPlaylistContent += `#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=${
            parseInt(videoSegmentInfos[0].bitrate) * 1000
          },BANDWIDTH=${
            parseInt(videoSegmentInfos[0].maxrate) * 1000
          },RESOLUTION=${
            videoSegmentInfos[0].width + "x" + videoSegmentInfos[0].height
          }\n${playlistUrl}\n`;

          // Ghi nội dung vào file master.m3u8
          fs.writeFileSync(masterFilePath, masterPlaylistContent);

          resolve();
        } catch (error) {
          throw error;
        }
      })
      .on("error", (err) => {
        for (const videoSegmentInfo of videoSegmentInfos) {
          fs.rmSync(videoSegmentInfo.folderPath, {
            recursive: true,
            force: true,
          });
        }
        reject(err);
      })
      .run();
  }).catch((error) => {
    throw error;
  });

  ffmpeg2
    .on("stderr", (stderr) => {
      console.error("FFmpeg stderr:", stderr);
    })
    .on("stdout", (stdout) => {
      console.log("FFmpeg stdout:", stdout);
    })
    .on("end", () => {
      try {
        let masterContent = videoSegmentInfos
          .slice(1)
          .map((info) => {
            const playlistUrl = encodeURI(
              videoBaseUrl +
                filename +
                "?type=stream&resolution=" +
                info.quality,
            );

            return `#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=${
              parseInt(info.maxrate) * 1000
            },BANDWIDTH=${parseInt(info.bitrate) * 1000},RESOLUTION=${
              info.width
            }x${info.height}\n${playlistUrl}`;
          })
          .join("\n");
        if (fs.existsSync(masterFilePath)) {
          fs.appendFileSync(masterFilePath, masterContent);
        } else {
          console.error("File does not exist");
        }
      } catch (error) {
        console.log(error);
      }
    })
    .on("error", (err) => {
      throw err;
    })
    .run();
}

module.exports = {
  createHls,
};
