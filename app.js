require("dotenv").config();
require("express-async-errors");
const { createServer } = require("http");
const express = require("express");
const app = express();
const helmet = require("helmet");
const cors = require("cors");
const connectDb = require("./db/connect");
const { init } = require("./socket");
const { User, Playlist } = require("./models");
const {
  authMiddleware,
  notFoundMiddleware,
  errorHandlerMiddleware,
  permissionMiddleware,
  getAccountInfoMiddleware,
} = require("./middlewares");

const {
  authRouter,
  userRouter,
  fileRouter,
  videoRouter,
  commentRouter,
  playlistRouter,
  tagRouter,
  combineRouter,
  clientRouter,
} = require("./routes");

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use(helmet());

app.get("/", (req, res) => {
  res.send("Hello, world!");
});

// Admin
app.use("/api/v1/admin", authMiddleware, permissionMiddleware);
// Client
app.use("/api/v1/client", authMiddleware, clientRouter);

// Both site
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/file", fileRouter);

// User site
app.use("/api/v1/data", getAccountInfoMiddleware, combineRouter);

// Admin site
app.use("/api/v1/user", authMiddleware, permissionMiddleware, userRouter);
app.use("/api/v1/tag", authMiddleware, permissionMiddleware, tagRouter);
// app.use("/api/v1/video", authMiddleware, permissionMiddleware, videoRouter);
app.use("/api/v1/video", videoRouter);
app.use("/api/v1/comment", authMiddleware, permissionMiddleware, commentRouter);
app.use(
  "/api/v1/playlist",
  authMiddleware,
  permissionMiddleware,
  playlistRouter,
);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDb(process.env.DB_URI);

    const httpServer = createServer(app);
    init(httpServer);
    // io.use(cors());
    httpServer.listen(port, () =>
      console.log(`Server is listening on ${port}....`),
    );
    // app.listen(port, () => console.log(`Server is listening on ${port}....`));
  } catch (error) {
    console.log(error);
  }
};

start();
