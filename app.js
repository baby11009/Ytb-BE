require("dotenv").config();
require("express-async-errors");
const { createServer } = require("http");
const express = require("express");
const app = express();
const helmet = require("helmet");
const cors = require("cors");
const connectDb = require("./db/connect");
const { init } = require("./socket/socket");
const { connectRedis } = require("./redis/redis");
const {
  authMiddleware,
  notFoundMiddleware,
  errorHandlerMiddleware,
  permissionMiddleware,
  getAccountInfoMiddleware,
} = require("./middlewares");

const {
  authRouter,
  fileRouter,
  combineRouter,
  redisRouter,
  adminRouter,
  userRouter,
} = require("./routes");

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use(helmet());

app.get("/", (req, res) => {
  res.status(200).send("Hello, world!");
});

// Client
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/file", fileRouter);
app.use("/api/v1/data", getAccountInfoMiddleware, combineRouter);
app.use("/api/v1/redis", redisRouter);

// Admin
app.use("/api/v1/admin", authMiddleware, permissionMiddleware, adminRouter);

// User
app.use("/api/v1/user", authMiddleware, userRouter);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDb(process.env.DB_URI);

    const httpServer = createServer(app);
    init(httpServer);
    await connectRedis();
    httpServer.listen(port, () =>
      console.log(`Server is listening on ${port}....`),
    );
  } catch (error) {
    console.log(error);
  }
};

start();
