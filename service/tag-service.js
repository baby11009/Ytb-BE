const { Tag } = require("../models");
const { deleteFile } = require("../utils/file");
const { sessionWrap } = require("../utils/session");
const { NotFoundError, InternalServerError } = require("../errors");
const { TagValidator } = require("../utils/validate");

const path = require("path");
const iconPath = path.join(__dirname, "../assets/tag icon");

class TagService {
  async createNewTag(data, files) {
    const { title } = data;

    const foundedTag = await Tag.findOne({ title: title });

    if (foundedTag) {
      throw new BadRequestError("Tag's title must be unique");
    }

    const tagData = {
      title: title,
      slug: title.toLowerCase().replace(/[^\w]+/g, "-"),
      icon: files.icon[0].filename,
    };

    const tag = await Tag.create(tagData);
    return tag;
  }

  async updateTagDetails(tagId, data, files) {
    const foundedTag = await Tag.findById(tagId);

    if (!foundedTag) {
      throw new NotFoundError(`Cannot find tag with id ${tagId}`);
    }

    const updateDatas = new TagValidator(
      {
        ...data,
        ...files,
      },
      foundedTag,
    ).getValidatedUpdateData();

    const tagData = await Tag.findOneAndUpdate({ _id: id }, updateDatas, {
      new: true,
    }).select("-__v");

    if (!tagData) {
      throw new InternalServerError("Failed to update tag");
    }

    if (files?.icon && files.icon.length) {
      const iconFilePath = path.join(iconPath, foundedTag.icon);
      await deleteFile(iconFilePath);
    }

    return tagData;
  }

  async deleteSingleTag(tagId) {
    const foundedTag = await Tag.findById(tagId);

    if (!foundedTag) {
      throw new NotFoundError(`Cannot find tag with id ${tagId}`);
    }
    await sessionWrap(async (session) => {
      await Tag.deleteOne({ _id: tagId }, { session });
    });

    deleteFile(path.join(iconPath, foundedTag.icon));
  }

  async deleteManyTagService(idArray) {
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

    await Tag.deleteMany({ _id: { $in: idArray } });

    for (const icon of foundedTagsIcon) {
      deleteFile(path.join(iconPath, icon));
    }
  }
}

module.exports = new TagService();
