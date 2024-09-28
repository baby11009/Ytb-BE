const generateCodeAndExpire = () => {
  const confirmCode = Math.floor(10000 + Math.random() * 90000).toString();

  // 10 min
  const confirmCodeExpires = Date.now() + 600000;

  return {
    confirmCode,
    confirmCodeExpires,
  };
};

module.exports = {
  generateCodeAndExpire,
};
