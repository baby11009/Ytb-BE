const { Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError } = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const iconPath = path.join(__dirname, "../../assets/tag icon");

const createTag = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      throw new BadRequestError("Please provide data to register");
    }

    const foundedTag = await Tag.findOne({ title: req.body.title });

    if (foundedTag) {
      throw new BadRequestError("Tag's title must be unique");
    }

    const data = {
      ...req.body,
    };

    if (req.files.image) {
      data.icon = req.files.image[0].filename;
    }

    const tag = await Tag.create(data);
    res.status(StatusCodes.CREATED).json({ data: tag });
  } catch (error) {
    if (req.files.image) {
      const imgPath = path.join(iconPath, req.files.image[0].filename);
      deleteFile(imgPath);
    }
    throw error;
  }
};

const getTags = async (req, res) => {
  const { limit, page, title, createdAt } = req.query;

  const dataLimit = Number(limit) || 5;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  let findObj = {};

  if (title) {
    findObj.title = { $regex: title, $options: "i" };
  }

  let result = Tag.find(findObj);

  let sortNum = -1;
  if (createdAt === "cũ nhất") {
    sortNum = 1;
  }

  const tags = await result
    .limit(dataLimit)
    .skip(skip)
    .sort({ createdAt: sortNum });

  const totalTags = await Tag.countDocuments(findObj);

  res.status(StatusCodes.OK).json({
    data: tags,
    qtt: tags.length,
    totalQtt: totalTags,
    currPage: dataPage,
    totalPages: Math.ceil(totalTags / limit),
  });
};

const getTagDetails = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide tag ID");
  }

  const tag = await Tag.findById(id);

  if (!tag) {
    throw new NotFoundError(`Cannot find tag with id ${id}`);
  }
  res.status(StatusCodes.OK).json({ data: tag });
};

const updateTag = async (req, res) => {
  const { id } = req.params;

  const { title, slug } = req.body;

  if (!id) {
    throw new BadRequestError("Please provide tag ID");
  }

  if (!req.files?.image && !title) {
    throw new BadRequestError("Please provide data to update");
  }

  try {
    const foundedTag = await Tag.findById(id);

    if (!foundedTag) {
      throw new NotFoundError(`Cannot find tag with id ${id}`);
    }

    let updateData = {};

    if (title) {
      if (foundedTag.title === title) {
        throw new BadRequestError("Tag's title is still the same");
      }
      updateData.title = title;
    }

    if (slug) {
      if (foundedTag.slug === slug) {
        throw new BadRequestError("Tag's slug is still the same");
      }

      updateData.slug = slug;
    }

    if (req.files.image) {
      updateData.icon = req.files.image[0].filename;
    }

    await Tag.updateOne({ _id: id }, updateData);

    if (req.files.image) {
      const imgPath = path.join(iconPath, foundedTag.icon);
      deleteFile(imgPath);
    }

    res.status(StatusCodes.OK).json({ msg: "Tag updated successfully" });
  } catch (error) {
    if (req.files.image) {
      const imgPath = path.join(iconPath, req.files.image[0].filename);
      deleteFile(imgPath);
    }
    throw error;
  }
};

const deleteTag = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new BadRequestError("Please provide tag ID");
  }

  const foundedTag = await Tag.findById(id);

  if (!foundedTag) {
    throw new NotFoundError(`Cannot find tag with id ${id}`);
  }

  await Tag.deleteOne({ _id: id });

  if (foundedTag.icon) {
    const imgPath = path.join(iconPath, foundedTag.icon);
    deleteFile(imgPath);
  }

  res.status(StatusCodes.OK).json({ msg: "Tag deleted successfully" });
};

const deleteManyTags = async (req, res) => {
  const { idList } = req.body;

  if (!idList || idList.length === 0) {
    throw new BadRequestError("Must choose at least one tag");
  }

  const notFoundedTags = (
    await Promise.all(
      idList.map(async (id) => {
        const tag = await Tag.findById(id);
        if (!tag) {
          return id;
        }
        return null;
      })
    )
  ).filter((id) => id !== null);

  if (notFoundedTags.length > 0) {
    throw new NotFoundError(
      `Cannot find these tags with id : ${notFoundedTags.join(", ")}`
    );
  }

  await Promise.all(
    idList.map(async (id) => {
      const tag = await Tag.findByIdAndDelete(id);
      if (!tag) {
        throw new BadRequestError(`Cannot delete tag with id ${id}`);
      }
      const imagePath = path.join(iconPath, tag.icon);
      deleteFile(imagePath);
    })
  );

  res.status(StatusCodes.OK).json({ msg: "Tags deleted successfully" });
};

module.exports = {
  createTag,
  getTags,
  getTagDetails,
  updateTag,
  deleteTag,
  deleteManyTags,
};
