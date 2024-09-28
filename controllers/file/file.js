const path = require("path");
const fs = require("fs");
const { NotFoundError } = require("../../errors");

const assetsPath = path.join(__dirname, "../../assets");

const handleViewFile = async (req, res, fileFolder = "") => {
  try {
    const { name } = req.params;
    
    if (!name) {
      res.status(400).send("Please provide a name");
    }

    const finalPath = path.join(assetsPath, fileFolder, name);

    try {
      await fs.promises.access(finalPath, fs.constants.F_OK);
      res.sendFile(finalPath);
    } catch (err) {
      throw new NotFoundError(`Not found file with name ${name}`);
    }
  } catch (error) {
    console.log(error);
    res
      .status(error.statusCode || 500)
      .send(error.message || "Failed to load file");
  }
};

module.exports = {
  handleViewFile,
};
