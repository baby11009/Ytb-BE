const searchWithRegex = (value) => ({ $regex: value, $options: "i" });
const isObjectEmpty = (object) => {
  for (const key in object) {
    if (object.hasOwnProperty(key)) return false;
  }
  return true;
};
module.exports = { searchWithRegex, isObjectEmpty };
