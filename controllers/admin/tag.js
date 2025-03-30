const { Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  NotFoundError,
  InvalidError,
} = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const { mongoose } = require("mongoose");
const { searchWithRegex, isObjectEmpty } = require("../../utils/other");
const { TagValidator, Validator } = require("../../utils/validate");
const iconPath = path.join(__dirname, "../../assets/tag icon");

const createTag = async (req, res) => {
  try {
    if (
      Object.keys(req.body).length === 0 ||
      !req.files?.icon ||
      req.files.icon.length < 1
    ) {
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
      icon: req.files.icon[0].filename,
    };

    const tag = await Tag.create(data);
    res.status(StatusCodes.CREATED).json({ data: tag });
  } catch (error) {
    if (req.files?.icon && req.files.icon.length) {
      const imgPath = path.join(
        iconPath,
        req.files.icon && req.files.icon[0].filename,
      );
      deleteFile(imgPath);
    }
    throw error;
  }
};

const getTags = async (req, res) => {
  const { limit, page, sort, search, priorityList } = req.query;

  const dataLimit = Number(limit) || 5;
  const dataPage = Number(page) || 1;

  const skip = (dataPage - 1) * dataLimit;

  const validator = new Validator();

  const errors = {
    invalidKey: [],
    invalidValue: [],
  };

  const searchObj = {};

  const searchEntries = Object.entries(search || {});

  if (searchEntries.length > 0) {
    const searchFuncObj = {
      title: (title) => {
        validator.isString("title", title);
        searchObj.title = searchWithRegex(title);
      },
    };

    for (const [key, value] of searchEntries) {
      if (!searchFuncObj[key]) {
        errors.invalidKey.push(key);
        continue;
      }

      try {
        searchFuncObj[key](value);
      } catch (error) {
        errors.invalidValue.push(key);
      }
    }
  }

  let sortObj = {};

  const sortEntries = Object.entries(sort || {});

  if (sortEntries.length > 0) {
    const sortKeys = new Set(["createdAt"]);
    const sortValueEnum = {
      1: 1,
      "-1": -1,
    };

    for (const [key, value] of sortEntries) {
      if (!sortKeys.has(key)) {
        errors.invalidKey(key);
        continue;
      }

      if (!sortValueEnum[value]) {
        errors.invalidValue(value);
        continue;
      }

      sortObj[key] = sortValueEnum[value];
    }
  }

  for (const error in errors) {
    if (errors[error].length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json(errors);
    }
  }

  if (isObjectEmpty(sortObj)) {
    sortObj.createdAt = -1;
  }

  const pipeline = [{ $match: searchObj }];

  if (priorityList && priorityList.length > 0) {
    sortObj = { priority: -1, ...sortObj };

    pipeline.push(
      {
        $set: {
          _idStr: { $toString: "$_id" },
        },
      },
      {
        $set: {
          priority: { $cond: [{ $in: ["$_idStr", priorityList] }, 1, 0] },
        },
      },
    );
  }

  pipeline.push(
    {
      $sort: sortObj,
    },
    {
      $facet: {
        totalCount: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: dataLimit }],
      },
    },
  );

  const tags = await Tag.aggregate(pipeline);

  res.status(StatusCodes.OK).json({
    data: tags[0]?.data,
    qtt: tags[0]?.data?.length,
    totalQtt: tags[0]?.totalCount[0]?.total,
    currPage: dataPage,
    totalPages: Math.ceil(tags[0]?.totalCount[0]?.total / dataLimit),
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

  if (!id) {
    throw new BadRequestError("Please provide tag ID");
  }

  if (!req.files?.icon && Object.keys(req.body) < 1) {
    throw new BadRequestError("Please provide data to update");
  }

  const foundedTag = await Tag.findById(id);

  if (!foundedTag) {
    throw new NotFoundError(`Cannot find tag with id ${id}`);
  }

  try {
    const updateDatas = new TagValidator(
      {
        ...req.body,
        ...req.files,
      },
      foundedTag,
    ).getValidatedUpdateData();

    const tagData = await Tag.findOneAndUpdate({ _id: id }, updateDatas, {
      new: true,
    }).select("-__v");

    if (req.files?.icon && req.files.icon.length) {
      const imgPath = path.join(iconPath, foundedTag.icon);
      await deleteFile(imgPath);
    }

    res
      .status(StatusCodes.OK)
      .json({ msg: "Tag updated successfully", data: tagData });
  } catch (error) {
    if (req.files?.icon && req.files.icon.length) {
      deleteFile(req.files.icon[0].path);
    }

    if (error instanceof InvalidError) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ errors: error.errorObj });
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
