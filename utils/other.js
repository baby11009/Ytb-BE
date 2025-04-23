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

// Completely randomize two lists
// function mergeListsRandomly(list1, list2) {
//   // Kết hợp hai mảng
//   const combinedList = [...list1, ...list2];
//   if (
//     combinedList.length !== list1.length &&
//     combinedList.length !== list2.length
//   ) {
//     // Thuật toán Fisher-Yates để trộn ngẫu nhiên
//     for (let i = combinedList.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [combinedList[i], combinedList[j]] = [combinedList[j], combinedList[i]];
//     }
//   }

//   return combinedList;
// }

// Merge two lists randomly, but keep the first list's order
function mergeListsRandomly(list1, list2) {
  if (!list1 || !list2) return [];

  // Return others list if other one is empty
  if (list1.length === 0) return list2;
  if (list2.length === 0) return list1;

  let rootList, otherList;

  if (list1.length > list2.length) {
    rootList = [...list1]; // Tạo bản sao để không thay đổi mảng gốc
    otherList = list2;
  } else {
    rootList = [...list2]; // Tạo bản sao để không thay đổi mảng gốc
    otherList = list1;
  }

  // Không cần lưu trữ các vị trí đã sử dụng nếu không cần tránh trùng lặp
  for (const item of otherList) {
    // Chú ý: Sử dụng (rootList.length + 1) để có thể chèn vào cả vị trí cuối cùng
    const rand = Math.floor(Math.random() * (rootList.length + 1));
    rootList.splice(rand, 0, item);
  }

  return rootList;
}
module.exports = {
  searchWithRegex,
  isObjectEmpty,
  encodedWithZlib,
  decodedWithZlib,
  mergeListsRandomly,
};
