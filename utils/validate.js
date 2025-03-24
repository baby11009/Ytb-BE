// Utility functions for type validation
const { BadRequestError, InvalidError, DataFieldError } = require("../errors");
const { Video, Tag } = require("../models");

const bcrypt = require("bcryptjs");

class Validator {
  isString(fieldName, value) {
    if (typeof value !== "string") {
      throw new DataFieldError(`${fieldName} must be a string`);
    }
  }

  isBoolean(fieldName, value) {
    if (typeof value !== "boolean") {
      throw new DataFieldError(`${fieldName} must be a boolean`);
    }
  }

  isNumber(fieldName, value) {
    if (typeof value !== "number" || isNaN(value)) {
      throw new DataFieldError(`${fieldName} must be a number`);
    }
  }

  isInteger(fieldName, value) {
    if (Number.isInteger(value)) {
      throw new DataFieldError(`${fieldName} must be an integer`);
    }
  }

  isArray(fieldName, value) {
    if (!Array.isArray(value)) {
      throw new DataFieldError(`${fieldName} must be an array`);
    }
  }

  isEnum(fieldName, allowedValues, value) {
    if (!allowedValues.includes(value)) {
      throw new DataFieldError(
        `${fieldName} must be one of: ${allowedValues.join(", ")}`,
      );
    }
  }

  stringMinLength(fieldName, value, minLength) {
    if (value.trim().length < minLength) {
      throw new DataFieldError(
        `${fieldName} must be at least ${minLength} characters long`,
      );
    }
  }

  stringMaxLength(fieldName, value, maxLength) {
    if (value.trim().length > maxLength) {
      throw new DataFieldError(
        `${fieldName} must not exceed ${maxLength} characters`,
      );
    }
  }

  numberMin(fieldName, value, min) {
    if (value < min) {
      throw new DataFieldError(`${fieldName} cannot be less than ${min}`);
    }
  }

  numberMax(fieldName, value, max) {
    if (value > max) {
      throw new DataFieldError(`${fieldName} cannot be greater than ${max}`);
    }
  }

  arrayMinLength(fieldName, value, minLength) {
    if (value.length < minLength) {
      throw new DataFieldError(
        `${fieldName} must have at least ${minLength} items`,
      );
    }
  }

  arrayMaxLength(fieldName, value, minLemaxLengthngth) {
    if (value.length > maxLength) {
      throw new DataFieldError(
        `${fieldName} cannot have more than ${maxLength} items`,
      );
    }
  }

  isNotTheSame(fieldName, newValue, oldValue) {
    if (JSON.stringify(newValue) === JSON.stringify(oldValue)) {
      throw new DataFieldError(`New ${fieldName} value is still the same`);
    }
  }

  isImageFile(fieldName, file) {
    if (typeof file !== "object" || !file.mimetype.startsWith("image/")) {
      throw new DataFieldError(`${fieldName} must be an image file`);
    }
  }
}

class UserValidator {
  #data;
  #currentData;
  #validator;
  #allowedFields = [
    "name",
    "password",
    "role",
    "confirmed",
    "subscriber",
    "description",
    "avatar",
    "banner",
  ];
  #errors = {};

  constructor(data, currentData, allowedFields) {
    this.#data = data;
    this.#currentData = currentData;
    this.#validator = new Validator();
    if (allowedFields) {
      this.#allowedFields = allowedFields;
    }
  }

  #sanitizeData() {
    const invalidFields = Object.keys(this.#data).filter(
      (field) => !this.#allowedFields.includes(field),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields in user update request: ${invalidFields.join(", ")}`,
      );
    }
  }

  #validateName() {
    this.#validator.isString("name", this.#data.name);
    this.#validator.stringMinLength("name", this.#data.name, 1);
    this.#validator.isNotTheSame(
      "name",
      this.#data.name,
      this.#currentData.name,
    );

    return this.#data.name;
  }

  async #validatePassword() {
    this.#validator.isString("password", this.#data.password);

    this.#validator.stringMinLength("password", this.#data.password, 6);

    const isMatch = await bcrypt.compare(
      this.#data.password,
      this.#currentData.password,
    );

    if (isMatch) {
      throw new DataFieldError("New password is the same as the old password");
    }

    const salt = await bcrypt.genSalt(10);

    const newPassword = await bcrypt.hash(this.#data.password, salt);
    return newPassword;
  }

  #validateRole() {
    this.#validator.isEnum("role", ["user", "admin"], this.#data.role);
    return this.#data.role;
  }

  #validateConfirmed() {
    this.#validator.isBoolean("confirmed", this.#data.confirmed);
    return this.#data.confirmed;
  }

  #validateSubscriber() {
    this.#validator.isInteger("subscriber", this.#data.subscriber);
    return this.#data.subscriber;
  }

  #validateDescription() {
    this.#validator.isString("description", this.#data.description);
    return this.#data.description;
  }

  #validateAvatar() {
    this.#validator.isImageFile("avatar", this.#data.avatar[0]);
    return this.#data.avatar[0].filename;
  }

  #validateBanner() {
    this.#validator.isImageFile("banner", this.#data.banner[0]);
    return this.#data.banner[0].filename;
  }

  async getValidatedUpdateData() {
    this.#sanitizeData();

    const validators = {
      name: () => {
        return this.#validateName();
      },
      password: async () => {
        return this.#validatePassword();
      },
      role: () => {
        return this.#validateRole();
      },
      confirmed: () => {
        return this.#validateConfirmed();
      },
      subscriber: () => {
        return this.#validateSubscriber();
      },
      description: () => {
        return this.#validateDescription();
      },
      avatar: () => {
        return this.#validateAvatar();
      },
      banner: () => {
        return this.#validateBanner();
      },
    };

    const updateDatas = {};

    for (const field in this.#data) {
      try {
        updateDatas[field] = await validators[field]();
      } catch (error) {
        if (error instanceof DataFieldError) {
          this.#errors[field] = error.message;
        } else {
          throw error;
        }
      }
    }

    if (Object.keys(this.#errors).length > 0) {
      throw new InvalidError(this.#errors);
    }

    return updateDatas;
  }
}

class VideoValidator {
  #data;
  #currentData;
  #validator;
  #allowedFields = [
    "title",
    "view",
    "like",
    "dislike",
    "type",
    "tags",
    "description",
    "thumbnail",
  ];
  #errors = {};

  constructor(data, currentData, allowedFields) {
    this.#data = data;
    this.#currentData = currentData;
    this.#validator = new Validator();
    if (allowedFields) {
      this.#allowedFields = allowedFields;
    }
  }

  #sanitizeData() {
    const invalidFields = Object.keys(this.#data).filter(
      (field) => !this.#allowedFields.includes(field),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields in video update request: ${invalidFields.join(", ")}`,
      );
    }
  }

  #validateTitle() {
    this.#validator.isString("title", this.#data.title);
    this.#validator.isNotTheSame(
      "title",
      this.#data.title,
      this.#currentData.title,
    );
    return this.#data.title;
  }

  #validateView() {
    this.#validator.isInteger("view", this.#data.view);
    this.#validator.isNotTheSame(
      "title",
      this.#data.view,
      this.#currentData.view,
    );
    return this.#data.view;
  }

  #validateLike() {
    this.#validator.isInteger("like", this.#data.like);
    this.#validator.isNotTheSame(
      "title",
      this.#data.like,
      this.#currentData.like,
    );
    return this.#data.like;
  }

  #validateDislike() {
    this.#validator.isInteger("dislike", this.#data.dislike);
    this.#validator.isNotTheSame(
      "title",
      this.#data.dislike,
      this.#currentData.dislike,
    );
    return this.#data.dislike;
  }

  #validateType() {
    const allowedTypes = ["short", "video"];
    this.#validator.isEnum("type", allowedTypes, this.#data.type);
    return this.#data.type;
  }

  async #validateTags() {
    this.#data.tags = JSON.parse(this.#data.tags);
    this.#validator.isArray("tags", this.#data.tags);

    if (this.#data.tags.length > 0) {
      const foundedTags = await Tag.find({ _id: { $in: this.#data.tags } });

      if (foundedTags.length !== this.#data.tags.length) {
        const foundedTagIds = foundedTags.map((tag) => tag._id);
        const inValidIds = this.#data.tags.filter(
          (tagId) => !foundedTagIds.includes(tagId),
        );
        throw new Error(`Invalid tags provided : ${inValidIds.join(", ")}`);
      }
    }

    return this.#data.tags;
  }

  #validateDescription() {
    this.#validator.isString("description", this.#data.description);
    this.#validator.stringMaxLength(
      "description",
      this.#data.description,
      5000,
    );

    return this.#data.description;
  }

  #validateThumbnail() {
    this.#validator.isImageFile("thumbnail", this.#data.thumbnail[0]);

    return this.#data.thumbnail[0].filename;
  }

  async getValidatedUpdateData() {
    this.#sanitizeData();

    const validators = {
      title: () => {
        return this.#validateTitle();
      },
      view: () => {
        return this.#validateView();
      },
      like: () => {
        return this.#validateLike();
      },
      dislike: () => {
        return this.#validateDislike();
      },
      type: () => {
        return this.#validateType();
      },
      tags: async () => {
        return await this.#validateTags();
      },
      description: () => {
        return this.#validateDescription();
      },
      thumbnail: () => {
        return this.#validateThumbnail();
      },
    };

    const updateDatas = {};

    for (const field in this.#data) {
      try {
        if (field === "thumbnail") {
          updateDatas["thumb"] = await validators[field]();
        }
        updateDatas[field] = await validators[field]();
      } catch (error) {
        if (error instanceof DataFieldError) {
          this.#errors[field] = error.message;
        } else {
          throw error;
        }
      }
    }

    if (Object.keys(this.#errors).length > 0) {
      throw new InvalidError(this.#errors);
    }

    return updateDatas;
  }
}

class CommentValidator {
  #data;
  #currentData;
  #validator;
  #allowedFields = ["cmtText", "like", "dislike"];
  #errors = {};

  constructor(data, currentData, allowedFields) {
    this.#data = data;
    this.#currentData = currentData;
    this.#validator = new Validator();
    if (allowedFields) {
      this.#allowedFields = allowedFields;
    }
  }

  #sanitizeData() {
    const invalidFields = Object.keys(this.#data).filter(
      (field) => !this.#allowedFields.includes(field),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields in comment update request: ${invalidFields.join(", ")}`,
      );
    }
  }

  #validateCmtText() {
    this.#validator.isString("cmtText", this.#data.cmtText);
    this.#validator.stringMinLength("cmtText", this.#data.cmtText, 1);
    this.#validator.isNotTheSame(
      "cmtText",
      this.#data.cmtText,
      this.#currentData.cmtText,
    );

    return this.#data.cmtText;
  }

  #validateLike() {
    this.#validator.isNumber("like", this.#data.like);
    this.#validator.numberMin("like", this.#data.like, 0);
    this.#validator.isNotTheSame(
      "like",
      this.#data.like,
      this.#currentData.like,
    );

    return this.#data.like;
  }

  #validateDislike() {
    this.#validator.isNumber("dislike", this.#data.dislike);
    this.#validator.numberMin("dislike", this.#data.dislike, 0);
    this.#validator.isNotTheSame(
      "dislike",
      this.#data.dislike,
      this.#currentData.dislike,
    );

    return this.#data.dislike;
  }

  getValidatedUpdateData() {
    this.#sanitizeData();

    const validators = {
      cmtText: () => {
        return this.#validateCmtText();
      },
      like: () => {
        return this.#validateLike();
      },
      dislike: () => {
        return this.#validateDislike();
      },
    };

    const updateDatas = {};

    for (const field in this.#data) {
      try {
        updateDatas[field] = validators[field]();
      } catch (error) {
        if (error instanceof DataFieldError) {
          this.#errors[field] = error.message;
        } else {
          throw error;
        }
      }
    }

    if (Object.keys(this.#errors).length > 0) {
      throw new InvalidError(this.#errors);
    }

    return updateDatas;
  }
}

class PlaylistValidator {
  #data;
  #currentData;
  #validator;
  #allowedFields = {
    playlist: ["title", "privacy", "videoIdList"],
    watch_later: ["videoIdList"],
    history: ["videoIdList"],
  };
  #errors = {};

  constructor(data, currentData, allowedFields) {
    this.#data = data;
    this.#currentData = currentData;
    this.#validator = new Validator();
    if (allowedFields) {
      this.#allowedFields = allowedFields;
    }
  }
  #sanitizeData() {
    const allowedFieldsForType = this.#allowedFields[this.#currentData.type];

    if (!allowedFieldsForType) {
      throw new BadRequestError(
        `Playlist with type: ${this.#currentData.type} cannot be modified`,
      );
    }

    const invalidFields = Object.keys(this.#data).filter(
      (field) => !allowedFieldsForType.includes(field),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields for ${this.#currentData.type}: ${invalidFields.join(
          ", ",
        )}`,
      );
    }
  }

  #validateTitle() {
    this.#validator.isString("title", this.#data.title);

    this.#validator.stringMinLength("title", this.#data.title, 1);

    this.#validator.stringMaxLength("title", this.#data.title, 200);

    this.#validator.isNotTheSame(
      "title",
      this.#data.title,
      this.#currentData.title,
    );

    return this.#data.title;
  }

  #validatePrivacy() {
    this.#validator.isEnum(
      "privacy",
      ["private", "public"],
      this.#data.privacy,
    );

    this.#validator.isNotTheSame(
      "privacy",
      this.#data.privacy,
      this.#currentData.privacy,
    );

    return this.#data.privacy;
  }

  async #validateVideoIdList() {
    this.#validator.isArray("videoIdList", this.#data.videoIdList);

    this.#validator.arrayMinLength("videoIdList", this.#data.videoIdList, 1);

    if (this.#data.videoIdList.length > 0) {
      const foundedVideos = await Video.aggregate([
        {
          $set: {
            _idStr: { $toString: "$_id" },
          },
        },
        { $match: { _idStr: { $in: this.#data.videoIdList } } },
        { $group: { _id: null, idsFound: { $push: "$_idStr" } } },
        {
          $project: {
            _id: 1,
            missingIds: {
              $setDifference: [this.#data.videoIdList, "$idsFound"],
            },
          },
        },
      ]);

      if (foundedVideos.length === 0) {
        throw new DataFieldError(
          `The following videos with id: ${this.#data.videoIdList.join(
            ", ",
          )} could not be found`,
        );
      } else if (foundedVideos[0]?.missingIds?.length > 0) {
        throw new DataFieldError(
          `The following videos with id: ${foundedVideos[0].missingIds.join(
            ", ",
          )} could not be found`,
        );
      }
    }

    return this.#data.videoIdList;
  }

  async getValidatedUpdateData() {
    this.#sanitizeData();

    const updateDatas = {};

    const bulkWrites = [];

    const validators = {
      title: () => {
        updateDatas["title"] = this.#validateTitle();
      },
      privacy: () => {
        updateDatas["privacy"] = this.#validatePrivacy();
      },
      videoIdList: async () => {
        const videoIdList = await this.#validateVideoIdList();

        if (videoIdList.length > 0) {
          const alreadyExistIds = [];
          const newVideoIds = [];

          const itemListSet = new Set(this.#currentData.itemList);

          this.#data.videoIdList.forEach((id) => {
            if (itemListSet.has(id)) {
              alreadyExistIds.push(id);
            } else {
              newVideoIds.push(id);
            }
          });

          if (alreadyExistIds.length > 0) {
            bulkWrites.push({
              updateOne: {
                filter: { _id: this.#currentData._id },
                update: { $pull: { itemList: { $in: alreadyExistIds } } },
              },
            });
          }

          if (newVideoIds.length > 0) {
            bulkWrites.push({
              updateOne: {
                filter: { _id: this.#currentData._id },
                update: { $addToSet: { itemList: { $each: newVideoIds } } },
              },
            });
          }
        } else {
          bulkWrites.push({
            updateOne: { filter: { _id: this.#currentData._id } },
          });
        }
      },
    };

    for (const field in this.#data) {
      try {
        await validators[field]();
      } catch (error) {
        if (error instanceof DataFieldError) {
          this.#errors[field] = error.message;
        } else {
          throw error;
        }
      }
    }

    if (Object.keys(this.#errors).length > 0) {
      throw new InvalidError(this.#errors);
    }

    if (Object.keys(updateDatas).length > 0) {
      bulkWrites.push({
        updateOne: {
          filter: { _id: this.#currentData._id },
          update: { $set: updateDatas },
        },
      });
    }

    return bulkWrites;
  }
}

class TagValidator {
  #data;
  #currentData;
  #validator;
  #allowedFields = ["title", "icon"];
  #errors = {};

  constructor(data, currentData, allowedFields) {
    this.#data = data;
    this.#currentData = currentData;
    this.#validator = new Validator();
    if (allowedFields) {
      this.#allowedFields = allowedFields;
    }
  }

  #sanitizeData() {
    const invalidFields = Object.keys(this.#data).filter(
      (field) => !this.#allowedFields.includes(field),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields in user update request: ${invalidFields.join(", ")}`,
      );
    }
  }

  #validateTitle() {
    this.#validator.isString("title", this.#data.title);
    this.#validator.stringMinLength("title", this.#data.title, 3);
    this.#validator.stringMaxLength("title", this.#data.title, 30);
    this.#validator.isNotTheSame(
      "title",
      this.#data.title,
      this.#currentData.title,
    );

    return this.#data.title;
  }

  #validateIcon() {
    this.#validator.isImageFile("icon", this.#data.icon[0]);
    return this.#data.icon[0].filename;
  }

  getValidatedUpdateData() {
    this.#sanitizeData();

    const updateDatas = {};

    const validators = {
      title: () => {
        return this.#validateTitle();
      },
      icon: () => {
        return this.#validateIcon();
      },
    };

    for (const field in this.#data) {
      try {
        updateDatas[field] = validators[field]();
      } catch (error) {
        if (error instanceof DataFieldError) {
          this.#errors[field] = error.message;
        } else {
          throw error;
        }
      }
    }

    if (Object.keys(this.#errors).length > 0) {
      throw new InvalidError(this.#errors);
    }

    return updateDatas;
  }
}

module.exports = {
  Validator,
  UserValidator,
  VideoValidator,
  CommentValidator,
  PlaylistValidator,
  TagValidator,
};
