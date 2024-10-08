require("dotenv").config();
require("express-async-errors");

const express = require("express");
const app = express();
const helmet = require("helmet");
const cors = require("cors");
const connectDb = require("./db/connect");

const {
  authMiddleware,
  notFoundMiddleware,
  errorHandlerMiddleware,
  permissionMiddleware,
} = require("./middlewares");

const {
  authRouter,
  userRouter,
  fileRouter,
  clientUser,
  videoRouter,
  clientVideo,
  commentRouter,
  subscribeRouter,
  reactRouter,
  cmtReactRouter,
  playlistRouter,
  tagRouter,
  combineRouter,
} = require("./routes");

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use(helmet());

app.get("/", (req, res) => {
  res.send("Hello, world!");
});

// Both site
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/file", fileRouter);
app.use("/api/v1/comment", commentRouter);
app.use("/api/v1/video", videoRouter);
app.use("/api/v1/react", authMiddleware, reactRouter);

// User site
app.use("/api/v1/account", authMiddleware, clientUser);
app.use("/api/v1/clientVideo", clientVideo);
app.use("/api/v1/subscribe", authMiddleware, subscribeRouter);
app.use("/api/v1/cmtReact", authMiddleware, cmtReactRouter);
app.use("/api/v1/data", combineRouter);

// Admin site
// app.use("/api/v1/user", authMiddleware, permissionMiddleware, userRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/playlist", authMiddleware, playlistRouter);
app.use("/api/v1/tag", authMiddleware, permissionMiddleware, tagRouter);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDb(process.env.DB_URI);
    app.listen(port, () => console.log(`Server is listening on ${port}....`));
  } catch (error) {
    console.log(error);
  }
};

start();
