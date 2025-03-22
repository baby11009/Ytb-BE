const multer = require("multer");

const fields = ["image", "video"];

const multerErrorHandling = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
 
    // A Multer error occurred when uploading
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      if (!fields.includes(err.field)) {
        return res.status(400).json({
          message: "File upload only allowed for image and video field",
        });
      }
      return res.status(400).json({
        message: "The number of uploaded files exceeds the allowed limit",
      });
    }
  } else if (err) {
    console.log("🚀 ~ err:", err)
    // An unknown error occurred when uploading
    return res.status(500).json({ message: "Failed to upload file" });
  }
  next();
};

module.exports = multerErrorHandling;
