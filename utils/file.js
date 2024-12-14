const fs = require("fs");
const { getVideoDurationInSeconds } = require("get-video-duration");
const path = require("path");

const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath); // Deletes the file
      console.log(`File ${filePath} deleted successfully.`);
    } else {
      throw new Error("File not exited");
    }
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err.message);
  }
};

const deleteFolder = async (folderPath) => {
  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true }); // Deletes the folder and all its content
      console.log(`Folder ${folderPath} deleted successfully.`);
    } else {
      throw new Error("Folder not exited");
    }
  } catch (err) {
    console.error(`Error deleting folder ${folderPath}:`, err.message);
  }
};

const deleteFolderWithSameName = async (startPath, folderName) => {
  if (!fs.existsSync(startPath)) {
    console.error(`Path ${startPath} không tồn tại.`);
    return;
  }

  // Đọc tất cả các file và folder trong đường dẫn gốc
  const items = fs.readdirSync(startPath);

  items.forEach((item) => {
    const fullPath = path.join(startPath, item);

    // Kiểm tra nếu là thư mục
    if (fs.statSync(fullPath).isDirectory()) {
      if (item === folderName) {
        // Nếu tên thư mục trùng khớp, xóa nó
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`Đã xóa folder: ${fullPath}`);
      } else {
        // Nếu không, tiếp tục tìm kiếm trong thư mục con
        deleteFolderWithSameName(fullPath, folderName);
      }
    }
  });
};

const getVideoDuration = async (filePath) => {
  let duration;
  await getVideoDurationInSeconds(filePath).then((dur) => {
    duration = dur;
  });

  return Math.floor(duration);
};

module.exports = {
  deleteFile,
  deleteFolder,
  getVideoDuration,
  deleteFolderWithSameName,
};
