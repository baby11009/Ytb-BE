const { Tag } = require("../../models");
const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  NotFoundError,
  InvalidError,
} = require("../../errors");
const { deleteFile } = require("../../utils/file");
const path = require("path");
const { searchWithRegex, isObjectEmpty } = require("../../utils/other");
const {  Validator } = require("../../utils/validate");
const iconPath = path.join(__dirname, "../../assets/tag icon");
const {
  createNewTag,
  updateTagDetails,
  deleteSingleTag,
  deleteManyTagService,
} = require("../../service/tag-service");

const createTag = async (req, res) => {
  try {
    if (
      Object.keys(req.body).length === 0 ||
      !req.files?.icon ||
      req.files.icon.length < 1
    ) {
      throw new BadRequestError("Please provide data to register");
    }

    const createdTag = await createNewTag(req.body, req.files);

    res.status(StatusCodes.CREATED).json({ data: createdTag });
  } catch (error) {
    if (req.files?.icon && req.files.icon.length) {
      const iconFilePath = path.join(iconPath, req.files.icon[0].filename);
      deleteFile(iconFilePath);
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

  try {
    const tagData = await updateTagDetails(id, req.body, req.files);

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

  try {
    await deleteSingleTag(id);

    res.status(StatusCodes.OK).json({ msg: "Tag deleted successfully" });
  } catch (error) {
    throw error;
  }
};

const deleteManyTags = async (req, res) => {
  const { idList } = req.query;

  if (!idList) {
    throw new BadRequestError("Please provide list of tags to delete");
  }

  const idArray = idList.split(",");

  if (!Array.isArray(idArray) || idArray.length < 1) {
    throw new BadRequestError("idList must be an array and can't be empty");
  }

  try {
    await deleteManyTagService(idArray);

    res.status(StatusCodes.OK).json({ msg: "Tags deleted successfully" });
  } catch (error) {
    throw error;
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
