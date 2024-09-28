const express = require("express");

const router = express.Router();

const { createMulterUpload, multerErrorHandling } = require("../middlewares");

const {
  createUser,
  getUsers,
  getUserDetails,
  deleteUser,
  deleteManyUsers,
  updateUser,
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
    createUser
  );
router.route("/delete-many").post(deleteManyUsers);

router
  .route("/:id")
  .get(getUserDetails)
  .delete(deleteUser)
  .patch(
    createMulterUpload("user avatar").fields([{ name: "image", maxCount: 1 }]),
    multerErrorHandling,
    updateUser
  );

module.exports = router;
