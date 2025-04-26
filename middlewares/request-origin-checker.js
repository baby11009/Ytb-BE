const { ForbiddenError } = require("../errors");

const requestOriginChecker = (req, res, next) => {
  const allowedOrigin = ["http://localhost:5173/"];

  // Kiểm tra nếu request đến từ browser client
  // Browser thường gửi header "Referer" khi thực hiện request từ một trang web
  const referer = req.headers.referer;

  // Kiểm tra header 'sec-fetch-site' và 'sec-fetch-mode' (được hỗ trợ trong các browser hiện đại)
  // sec-fetch-site có thể là 'same-origin', 'same-site', 'cross-site', 'none'
  // sec-fetch-mode có thể là 'navigate', 'cors', 'no-cors', 'same-origin'
  const secFetchSite = req.headers["sec-fetch-site"];

  const secFetchMode = req.headers["sec-fetch-mode"];

  // Kiểm tra User-Agent để phân biệt browser với các tool như curl, postman
  const userAgent = req.headers["user-agent"];

  // Kiểm tra header X-Requested-With (thường được set bởi jQuery hoặc các framework frontend)
  const requestedWith = req.headers["x-requested-with"];

  // Kiểm tra xem request có phải từ client thực sự hay không
  const isLikelyFromClient =
    // Có Referer từ domain của bạn
    (referer && allowedOrigin.includes(referer)) ||
    // Là same-origin request và không phải CORS
    secFetchSite === "same-origin" ||
    secFetchSite === "same-site" ||
    // Có header X-Requested-With
    requestedWith === "XMLHttpRequest" ||
    // Kiểm tra mode là navigate (user click vào link hoặc submit form)
    secFetchMode === "navigate";

  if (isLikelyFromClient) {
    return next();
  }

  // Nếu request không đến từ client hợp lệ
  throw new ForbiddenError(
    "Direct API access is not allowed. This API can only be accessed from our client application.",
  );
};

module.exports = requestOriginChecker;
