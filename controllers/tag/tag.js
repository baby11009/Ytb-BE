const { Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError } = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const { default: mongoose } = require("mongoose");
const iconPath = path.join(__dirname, "../../assets/tag icon");

const createTag = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      throw new BadRequestError("Please provide data to register");
    }
    const { title } = req.body;
    const foundedTag = await Tag.findOne({ title: title });

    if (foundedTag) {
      throw new BadRequestError("Tag's title must be unique");
    }

    const data = {
      title: title,
      slug: title.toLowerCase().replace(/[^\w]+/g, "-"),
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
  const { limit, page, sort, search } = req.query;

  const dataLimit = Number(limit) || 5;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  let matchObj = {};

  const queryFuncObj = {
    title: (title) => {
      matchObj.title = { $regex: title, $options: "i" };
    },
  };

  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (queryFuncObj[key] && value) {
        queryFuncObj[key](value);
      }
    }
  }

  const sortObj = { createdAt: -1 };

  const sortFuncsObj = {
    createdAt: (value) => {
      const valueList = new Set([1, -1]);
      if (valueList.has(Number(value))) {
        sortObj.createdAt = Number(value);
      }
    },
  };

  if (sort) {
    for (const [key, value] of Object.entries(sort)) {
      if (sortFuncsObj[key]) {
        sortFuncsObj[key](value);
      }
    }
  }

  const tags = await Tag.find(matchObj)
    .limit(dataLimit)
    .skip(skip)
    .sort(sortObj);

  const totalTags = await Tag.countDocuments(matchObj);

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

  const bodyKeys = Object.keys(req.body);

  if (!id) {
    throw new BadRequestError("Please provide tag ID");
  }

  if (!req.files?.image && bodyKeys.length < 1) {
    throw new BadRequestError("Please provide data to update");
  }

  const foundedTag = await Tag.findById(id);

  if (!foundedTag) {
    throw new NotFoundError(`Cannot find tag with id ${id}`);
  }

  const updateDatas = {};

  const updateBodyHandler = {
    title: (title) => {
      if (!title || typeof title !== "string") {
        throw new BadRequestError("Title must be a non-empty string");
      }
      if (foundedTag.title === title) {
        throw new BadRequestError("Tag's title is still the same");
      }
      updateDatas.title = title;
    },
  };

  for (const key of bodyKeys) {
    if (updateBodyHandler[key]) {
      updateBodyHandler[key](req.body[key]);
    }
  }

  if (req.files && req.files?.image) {
    updateDatas.icon = req.files.image[0].filename;
  }

  if (Object.keys(updateDatas).length < 1) {
    throw new BadRequestError("No data to update");
  }

  try {
    const tagData = await Tag.findOneAndUpdate({ _id: id }, updateDatas, {
      new: true,
    }).select("-__v");

    if (req.files && req.files?.image) {
      const imgPath = path.join(iconPath, foundedTag.icon);
      await deleteFile(imgPath);
    }

    res
      .status(StatusCodes.OK)
      .json({ msg: "Tag updated successfully", data: tagData });
  } catch (error) {
    if (req.files && req.files?.image) {
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

  const session = await mongoose.startSession();

  session.startTransaction();

  try {
    await Tag.deleteOne({ _id: id }, { session });

    deleteFile(path.join(iconPath, foundedTag.icon));

    await session.commitTransaction();
    res.status(StatusCodes.OK).json({ msg: "Tag deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteManyTags = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide list of tags to delete");
  }

  const idArray = idList.split(",");
  console.log(idArray);
  const foundedTags = await Tag.find({ _id: { $in: idArray } }).select(
    "_id icon",
  );

  const foundedTagsIcon = [];

  const foundedTagIds = [];

  for (const tag of foundedTags) {
    foundedTagsIcon.push(tag.icon);
    foundedTagIds.push(tag._id.toString());
  }

  const notFoundedTags = idArray.filter(
    (tagId) => !foundedTagIds.includes(tagId),
  );

  if (notFoundedTags.length > 0) {
    throw new NotFoundError(
      `Cannot find these tags with id : ${notFoundedTags.join(", ")}`,
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Tag.deleteMany({ _id: { $in: idArray } }, { session });

    for (const icon of foundedTagsIcon) {
      await deleteFile(path.join(iconPath, icon));
    }
    await session.commitTransaction();
    res.status(StatusCodes.OK).json({ msg: "Tags deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  createTag,
  getTags,
  getTagDetails,
  updateTag,
  deleteTag,
  deleteManyTags,
};
