const generateCodeAndExpire = () => {
  const confirmCode = Math.floor(10000 + Math.random() * 90000).toString();

  // 10 min
  const confirmCodeExpires = Date.now() + 600000;

  return {
    confirmCode,
    confirmCodeExpires,
  };
};

function generateSessionId() {
  // Tạo session ID ngẫu nhiên hoặc mã hóa
  return Math.random().toString(36).substr(2, 9);
}

module.exports = {
  generateCodeAndExpire,
  generateSessionId,
};
