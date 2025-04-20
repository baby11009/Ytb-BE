const zlib = require("zlib");
const { Buffer } = require("buffer");

const searchWithRegex = (value) => ({ $regex: value, $options: "i" });
const isObjectEmpty = (object) => {
  for (const key in object) {
    if (object.hasOwnProperty(key)) return false;
  }
  return true;
};

const encodedWithZlib = (data) => {
  const json = JSON.stringify(data);
  const compressed = zlib.deflateSync(Buffer.from(json, "utf-8"));
  return compressed.toString("base64");
};

const decodedWithZlib = (encodedString) => {
  const cleaned = encodedString.replace(/ /g, "+");
  const buffer = Buffer.from(cleaned, "base64");
  const decompressed = zlib.inflateSync(buffer);
  return JSON.parse(decompressed.toString("utf-8"));
};

function mergeListsRandomly(list1, list2) {
  // Kết hợp hai mảng
  const combinedList = [...list1, ...list2];
  if (
    combinedList.length !== list1.length &&
    combinedList.length !== list2.length
  ) {
    // Thuật toán Fisher-Yates để trộn ngẫu nhiên
    for (let i = combinedList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combinedList[i], combinedList[j]] = [combinedList[j], combinedList[i]];
    }
  }

  return combinedList;
}

module.exports = {
  searchWithRegex,
  isObjectEmpty,
  encodedWithZlib,
  decodedWithZlib,
  mergeListsRandomly,
};
