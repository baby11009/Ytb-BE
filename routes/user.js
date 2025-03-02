const express = require("express");

const router = express.Router();

const {
  createMulterUpload,
  multerErrorHandling,
  fileLimitSizeMiddleware,
} = require("../middlewares");

const {
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteManyUsers,
  updateUser,
  testDlt,
} = require("../controllers/user/user");

router
  .route("/")
  .get(getUsers)
  .post(
    createMulterUpload("user avatar").fields([
      { name: "image", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, {
        image: 4,
        banner: 6,
      });
    },
    createUser,
  );

router.route("/delete-many").delete(deleteManyUsers);
router.route("/test").delete(testDlt);

router
  .route("/:id")
  .get(getUserDetails)
  .delete(deleteUser)
  .patch(
    createMulterUpload("user avatar").fields([
      { name: "image", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    multerErrorHandling,
    async (req, res, next) => {
      fileLimitSizeMiddleware(req, res, next, { image: 4, banner: 6 });
    },
    updateUser,
  );

module.exports = router;
