[1mdiff --git a/app.js b/app.js[m
[1mindex fe5da15..3d0ea0e 100644[m
[1m--- a/app.js[m
[1m+++ b/app.js[m
[36m@@ -6,8 +6,7 @@[m [mconst app = express();[m
 const helmet = require("helmet");[m
 const cors = require("cors");[m
 const connectDb = require("./db/connect");[m
[31m-const { init } = require("./socket/socket");[m
[31m-const { connectRedis } = require("./redis/redis");[m
[32m+[m[32mconst { init } = require("./service/socket");[m
 const {[m
   authMiddleware,[m
   notFoundMiddleware,[m
[36m@@ -57,10 +56,11 @@[m [mconst start = async () => {[m
 [m
     const httpServer = createServer(app);[m
     init(httpServer);[m
[31m-    await connectRedis();[m
[32m+[m[32m    // io.use(cors());[m
     httpServer.listen(port, () =>[m
       console.log(`Server is listening on ${port}....`),[m
     );[m
[32m+[m[32m    // app.listen(port, () => console.log(`Server is listening on ${port}....`));[m
   } catch (error) {[m
     console.log(error);[m
   }[m
[1mdiff --git a/config/nodeMailer.js b/config/nodeMailer.js[m
[1mdeleted file mode 100644[m
[1mindex e2eee0c..0000000[m
[1m--- a/config/nodeMailer.js[m
[1m+++ /dev/null[m
[36m@@ -1,17 +0,0 @@[m
[31m-const clientEmailConfig = {[m
[31m-  service: "gmail",[m
[31m-  host: "smtp.gmail.com",[m
[31m-  port: 587,[m
[31m-  secure: false,[m
[31m-  auth: {[m
[31m-    user: process.env.EMAIL,[m
[31m-    pass: process.env.SMTP_PASSWORD,[m
[31m-  },[m
[31m-  tls: {[m
[31m-    rejectUnauthorized: false,[m
[31m-  },[m
[31m-};[m
[31m-[m
[31m-module.exports = {[m
[31m-  clientEmailConfig[m
[31m-};[m
[1mdiff --git a/controllers/auth/auth.js b/controllers/auth/auth.js[m
[1mindex ff78e72..ad5f379 100644[m
[1m--- a/controllers/auth/auth.js[m
[1m+++ b/controllers/auth/auth.js[m
[36m@@ -193,7 +193,6 @@[m [mconst login = async (req, res) => {[m
     data: userData[0],[m
     token: user.createJwt(),[m
   };[m
[31m-[m
   res.status(StatusCodes.OK).json(data);[m
 };[m
 [m
[36m@@ -212,14 +211,14 @@[m [mconst sendConfirmCode = async (req, res) => {[m
     expires = confirmCodeExpires;[m
   }[m
 [m
[31m-  await User.updateOne([m
[32m+[m[32m  const user = await User.updateOne([m
     { email },[m
     {[m
       privateCode: confirmCode,[m
       codeType: type,[m
       codeExpires: expires,[m
     },[m
[31m-  );[m
[32m+[m[32m  ).select("-password");[m
 [m
   await sendEmailNotification([m
     email,[m
[1mdiff --git a/controllers/user/comment-react.js b/controllers/user/comment-react.js[m
[1mindex fef33f8..bc5d1fe 100644[m
[1m--- a/controllers/user/comment-react.js[m
[1m+++ b/controllers/user/comment-react.js[m
[36m@@ -1,13 +1,11 @@[m
 const { CmtReact, Comment } = require("../../models");[m
[31m-const { BadRequestError } = require("../../errors");[m
[32m+[m[32mconst { BadRequestError, NotFoundError } = require("../../errors");[m
 const { StatusCodes } = require("http-status-codes");[m
[31m-const { emitEvent } = require("../../socket/socket");[m
[31m-const {[m
[31m-  sendRealTimeNotification,[m
[31m-} = require("../../service/notification/notification");[m
[32m+[m[32mconst { emitEvent } = require("../../service/socket");[m
[32m+[m[32mconst mongoose = require("mongoose");[m
 [m
 const toggleCmtReact = async (req, res) => {[m
[31m-  const { userId, email } = req.user;[m
[32m+[m[32m  const { userId } = req.user;[m
   const { cmtId, type } = req.body;[m
 [m
   if (!cmtId) {[m
[36m@@ -80,7 +78,7 @@[m [mconst toggleCmtReact = async (req, res) => {[m
           from: "cmtreacts",[m
           let: {[m
             commentId: "$_id",[m
[31m-            userId: userId,[m
[32m+[m[32m            userId: new mongoose.Types.ObjectId(userId),[m
           },[m
           pipeline: [[m
             {[m
[36m@@ -108,7 +106,6 @@[m [mconst toggleCmtReact = async (req, res) => {[m
           _id: 1,[m
           "react_info._id": { $ifNull: ["$react_info._id", null] },[m
           "react_info.type": { $ifNull: ["$react_info.type", null] },[m
[31m-          user_id: 1,[m
           like: 1,[m
           dislike: 1,[m
           replied_cmt_id: 1,[m
[36m@@ -116,23 +113,11 @@[m [mconst toggleCmtReact = async (req, res) => {[m
       },[m
     ]);[m
 [m
[31m-    let type = "NORMAL";[m
[32m+[m[32m    let event = `update-comment-${userId}`;[m
     if (commentAfterUpdate[0]?.replied_cmt_id) {[m
[31m-      type = "REPLY";[m
[31m-    }[m
[31m-[m
[31m-    emitEvent(`update-comment-${userId}`, {[m
[31m-      data: commentAfterUpdate[0],[m
[31m-      type,[m
[31m-    });[m
[31m-[m
[31m-    if (userId.toString() !== commentAfterUpdate[0].user_id.toString()) {[m
[31m-      sendRealTimeNotification([m
[31m-        commentAfterUpdate[0].user_id,[m
[31m-        "content",[m
[31m-        `User ${email} just reacting to your comment`,[m
[31m-      );[m
[32m+[m[32m      event = `update-reply-comment-${userId}`;[m
     }[m
[32m+[m[32m    emitEvent(event, commentAfterUpdate[0]);[m
   }[m
 [m
   res.status(StatusCodes.OK).json({ msg });[m
[1mdiff --git a/controllers/user/comment.js b/controllers/user/comment.js[m
[1mindex 2fd95e6..c9c524e 100644[m
[1m--- a/controllers/user/comment.js[m
[1m+++ b/controllers/user/comment.js[m
[36m@@ -1,6 +1,6 @@[m
 const { User, Comment } = require("../../models/index.js");[m
 const { StatusCodes } = require("http-status-codes");[m
[31m-const { emitEvent } = require("../../socket/socket.js");[m
[32m+[m[32mconst { emitEvent } = require("../../service/socket.js");[m
 const mongoose = require("mongoose");[m
 const { CommentValidator, Validator } = require("../../utils/validate.js");[m
 const {[m
[36m@@ -11,9 +11,6 @@[m [mconst {[m
 } = require("../../errors/index.js");[m
 const { searchWithRegex } = require("../../utils/other");[m
 const { sessionWrap } = require("../../utils/session");[m
[31m-const {[m
[31m-  sendRealTimeNotification,[m
[31m-} = require("../../service/notification/notification");[m
 [m
 const createCmt = async (req, res) => {[m
   const neededKeys = ["videoId", "cmtText"];[m
[36m@@ -36,7 +33,7 @@[m [mconst createCmt = async (req, res) => {[m
     );[m
   }[m
 [m
[31m-  const { userId, email } = req.user;[m
[32m+[m[32m  const { userId } = req.user;[m
 [m
   const { videoId, cmtText, replyId } = req.body;[m
 [m
[36m@@ -51,9 +48,9 @@[m [mconst createCmt = async (req, res) => {[m
     video_id: videoId,[m
     cmtText: cmtText,[m
   };[m
[31m-  let replyCmt;[m
[32m+[m
   if (replyId) {[m
[31m-    replyCmt = await Comment.findById(replyId);[m
[32m+[m[32m    const replyCmt = await Comment.findById(replyId);[m
 [m
     if (!replyCmt) {[m
       throw new NotFoundError(`Not found comment with id ${replyId}`);[m
[36m@@ -138,19 +135,11 @@[m [mconst createCmt = async (req, res) => {[m
 [m
   if (replyId) {[m
     type = "REPLY";[m
[31m-[m
[31m-    if (userId.toString() !== replyCmt.user_id.toString()) {[m
[31m-      sendRealTimeNotification([m
[31m-        replyCmt.user_id,[m
[31m-        "content",[m
[31m-        `User ${email} just replying to your comment`,[m
[31m-      );[m
[31m-    }[m
   }[m
 [m
   emitEvent(`create-comment-${userId}`, {[m
     data: createdCmt[0],[m
[31m-    type,[m
[32m+[m[32m    type: type,[m
   });[m
 [m
   res.status(StatusCodes.CREATED).json({ msg: "Comment created" });[m
[1mdiff --git a/controllers/user/subscription.js b/controllers/user/subscription.js[m
[1mindex 3213780..8beceff 100644[m
[1m--- a/controllers/user/subscription.js[m
[1m+++ b/controllers/user/subscription.js[m
[36m@@ -6,12 +6,9 @@[m [mconst {[m
   NotFoundError,[m
 } = require("../../errors");[m
 const mongoose = require("mongoose");[m
[31m-const {[m
[31m-  sendRealTimeNotification,[m
[31m-} = require("../../service/notification/notification");[m
 [m
 const subscribe = async (req, res) => {[m
[31m-  const { userId, email } = req.user;[m
[32m+[m[32m  const { userId } = req.user;[m
 [m
   const { channelId } = req.body;[m
 [m
[36m@@ -45,15 +42,7 @@[m [mconst subscribe = async (req, res) => {[m
 [m
   try {[m
     const subscription = await Subscribe.create([finalData], { session });[m
[31m-[m
     await session.commitTransaction();[m
[31m-[m
[31m-    sendRealTimeNotification([m
[31m-      channelId,[m
[31m-      "content",[m
[31m-      `User ${email} just susbscribed to your channel`,[m
[31m-    );[m
[31m-[m
     res.status(StatusCodes.OK).json({[m
       message: "Successfully subscribed channel",[m
       data: {[m
[36m@@ -70,7 +59,7 @@[m [mconst subscribe = async (req, res) => {[m
 };[m
 [m
 const unsubscribe = async (req, res) => {[m
[31m-  const { userId ,email} = req.user;[m
[32m+[m[32m  const { userId } = req.user;[m
 [m
   const { channelId } = req.params;[m
 [m
[36m@@ -106,13 +95,6 @@[m [mconst unsubscribe = async (req, res) => {[m
       { session },[m
     );[m
     await session.commitTransaction();[m
[31m-[m
[31m-    sendRealTimeNotification([m
[31m-      channelId,[m
[31m-      "content",[m
[31m-      `User ${email} just unsubscribed to your channel`,[m
[31m-    );[m
[31m-[m
     res.status(StatusCodes.OK).json({[m
       message: "Successfully unsubscribed channel",[m
     });[m
[1mdiff --git a/controllers/user/user.js b/controllers/user/user.js[m
[1mindex 860ea7b..9600c73 100644[m
[1m--- a/controllers/user/user.js[m
[1m+++ b/controllers/user/user.js[m
[36m@@ -6,7 +6,7 @@[m [mconst {[m
 } = require("../../errors");[m
 const { deleteFile } = require("../../utils/file");[m
 const path = require("path");[m
[31m-const { Subscribe, User, Video, Playlist } = require("../../models");[m
[32m+[m[32mconst { Subscribe, User, Video, Playlist, React } = require("../../models");[m
 const avatarPath = path.join(__dirname, "../../assets/user avatar");[m
 const { UserValidator, Validator } = require("../../utils/validate");[m
 const { isObjectEmpty } = require("../../utils/other");[m
[36m@@ -15,7 +15,8 @@[m [mconst getAccountInfo = async (req, res) => {[m
   const { userId } = req.user;[m
 [m
   const user = await User.aggregate([[m
[31m-    { $match: { _id: userId } },[m
[32m+[m[32m    { $addFields: { _idStr: { $toString: "$_id" } } },[m
[32m+[m[32m    { $match: { _idStr: userId } },[m
     {[m
       $lookup: {[m
         from: "subscribes",[m
[1mdiff --git a/controllers/user/video-react.js b/controllers/user/video-react.js[m
[1mindex 99d8531..97e08a5 100644[m
[1m--- a/controllers/user/video-react.js[m
[1m+++ b/controllers/user/video-react.js[m
[36m@@ -131,9 +131,7 @@[m [mconst toggleReact = async (req, res) => {[m
     );[m
     await session.commitTransaction();[m
 [m
[31m-    if (userId.toString() !== foundedVideo.user_id.toString()) {[m
[31m-      sendRealTimeNotification(foundedVideo.user_id, "content", result.msg);[m
[31m-    }[m
[32m+[m[32m    await sendRealTimeNotification(userId, "content", result.msg);[m
 [m
     res.status(StatusCodes.OK).json(result);[m
   } catch (error) {[m
[1mdiff --git a/controllers/user/video.js b/controllers/user/video.js[m
[1mindex a013299..ac53d37 100644[m
[1m--- a/controllers/user/video.js[m
[1m+++ b/controllers/user/video.js[m
[36m@@ -1,10 +1,11 @@[m
[31m-const { User, Video, Subscribe } = require("../../models");[m
[32m+[m[32mconst { User, Video } = require("../../models");[m
 [m
 const { StatusCodes } = require("http-status-codes");[m
 [m
 const {[m
   BadRequestError,[m
   NotFoundError,[m
[32m+[m[32m  InternalServerError,[m
   InvalidError,[m
 } = require("../../errors");[m
 [m
[36m@@ -16,10 +17,6 @@[m [mconst { clearUploadedVideoFiles } = require("../../utils/clear");[m
 [m
 const { VideoValidator, Validator } = require("../../utils/validate");[m
 [m
[31m-const {[m
[31m-  sendRealTimeNotification,[m
[31m-} = require("../../service/notification/notification");[m
[31m-[m
 const path = require("path");[m
 [m
 const asssetPath = path.join(__dirname, "../../assets");[m
[36m@@ -27,7 +24,7 @@[m [mconst asssetPath = path.join(__dirname, "../../assets");[m
 const upLoadVideo = async (req, res) => {[m
   const { thumbnail, video } = req.files;[m
 [m
[31m-  const { userId, email } = req.user;[m
[32m+[m[32m  const { userId } = req.user;[m
 [m
   const { type, title, tags = [], description = "" } = req.body;[m
 [m
[36m@@ -77,21 +74,6 @@[m [mconst upLoadVideo = async (req, res) => {[m
 [m
     await Video.create(data);[m
 [m
[31m-    const notifi = async () => {[m
[31m-      const subscriberList = await Subscribe.find({ channel_id: userId });[m
[31m-      if (subscriberList.length > 0) {[m
[31m-        for (const subscriber of subscriberList) {[m
[31m-          sendRealTimeNotification([m
[31m-            subscriber.subscriber_id,[m
[31m-            "subscription",[m
[31m-            `Channel ${email} just uploaded new Video`,[m
[31m-          );[m
[31m-        }[m
[31m-      }[m
[31m-    };[m
[31m-[m
[31m-    notifi();[m
[31m-[m
     res.status(StatusCodes.CREATED).json({ msg: "Upload video successfully" });[m
   } catch (error) {[m
     let args = {};[m
[36m@@ -124,7 +106,7 @@[m [mconst getVideos = async (req, res) => {[m
     invalidValue: [],[m
   };[m
 [m
[31m-  const searchObj = { user_id: userId };[m
[32m+[m[32m  const searchObj = { _userIdStr: userId };[m
 [m
   const searchEntries = Object.entries(search || {});[m
 [m
[36m@@ -196,6 +178,11 @@[m [mconst getVideos = async (req, res) => {[m
   }[m
 [m
   const pipeline = [[m
[32m+[m[32m    {[m
[32m+[m[32m      $addFields: {[m
[32m+[m[32m        _userIdStr: { $toString: "$user_id" },[m
[32m+[m[32m      },[m
[32m+[m[32m    },[m
     {[m
       $match: searchObj,[m
     },[m
[36m@@ -222,7 +209,7 @@[m [mconst getVideos = async (req, res) => {[m
         like: 1,[m
         dislike: 1,[m
         description: 1,[m
[31m-        createdAt: -1,[m
[32m+[m[32m        createdAt: -1,[m[41m  [m
       },[m
     },[m
     {[m
[36m@@ -398,7 +385,7 @@[m [mconst deleteVideo = async (req, res) => {[m
 };[m
 [m
 const deleteManyVideos = async (req, res) => {[m
[31m-  const { idList } = req.query;[m
[32m+[m[32m  const { idList } = req.body;[m
 [m
   const { userId } = req.user;[m
 [m
[1mdiff --git a/db/connect.js b/db/connect.js[m
[1mindex 53e814d..0a949b6 100644[m
[1m--- a/db/connect.js[m
[1m+++ b/db/connect.js[m
[36m@@ -1,12 +1,7 @@[m
 const mongoose = require("mongoose");[m
 [m
[31m-const connectDb = async (uri) => {[m
[31m-  try {[m
[31m-    mongoose.connect(uri);[m
[31m-    console.log(`Connect DB ${uri}`);[m
[31m-  } catch (error) {[m
[31m-    console.log("DB connect error: ", error);[m
[31m-  }[m
[32m+[m[32mconst connectDb = (uri) => {[m
[32m+[m[32m  return mongoose.connect(uri);[m
 };[m
 [m
 module.exports = connectDb;[m
[1mdiff --git a/jobs/bull.jobs.js b/jobs/bull.jobs.js[m
[1mdeleted file mode 100644[m
[1mindex d5932c0..0000000[m
[1m--- a/jobs/bull.jobs.js[m
[1m+++ /dev/null[m
[36m@@ -1,23 +0,0 @@[m
[31m-const { clientTransporter } = require("../utils/email");[m
[31m-const { Notification } = require("../models");[m
[31m-const { publisher } = require("../redis/instance/notification.pub-sub");[m
[31m-[m
[31m-const sendEmail = async (job) => {[m
[31m-  const { email, subject, content } = job.data;[m
[31m-[m
[31m-  await clientTransporter.sendMail({[m
[31m-    from: process.env.EMAIL,[m
[31m-    to: email,[m
[31m-    subject: subject,[m
[31m-    html: content,[m
[31m-  });[m
[31m-};[m
[31m-[m
[31m-const createSubscriptionNotification = async (job) => {[m
[31m-  const { userId, type, message } = job.data;[m
[31m-[m
[31m-  const notification = await Notification.create({ userId, type, message });[m
[31m-  publisher.publish(`user:${userId}`, JSON.stringify(notification));[m
[31m-};[m
[31m-[m
[31m-module.exports = { sendEmail, createSubscriptionNotification };[m
[1mdiff --git a/middlewares/authentication.js b/middlewares/authentication.js[m
[1mindex 8af4d2c..7f36407 100644[m
[1m--- a/middlewares/authentication.js[m
[1m+++ b/middlewares/authentication.js[m
[36m@@ -9,14 +9,14 @@[m [mconst auth = async (req, res, next) => {[m
   if (!authHeader || !authHeader.startsWith("Bearer ")) {[m
     throw new UnauthenticatedError("Authentication invalid");[m
   }[m
[31m-[m
[32m+[m[41m  [m
   const token = authHeader.split(" ")[1];[m
 [m
   try {[m
     const payload = jwt.verify(token, process.env.JWT_SECRET);[m
 [m
     const user = await User.findById(payload.userId).select("-password");[m
[31m-[m
[32m+[m[41m    [m
     if (user.confirmed === false) {[m
       return next(new BadRequestError("Account not confirmed"));[m
     }[m
[36m@@ -26,9 +26,8 @@[m [mconst auth = async (req, res, next) => {[m
     // }[m
 [m
     req.user = {[m
[31m-      userId: user._id,[m
[31m-      name: user.username,[m
[31m-      email: user.email,[m
[32m+[m[32m      userId: payload.userId,[m
[32m+[m[32m      name: payload.username,[m
       role: user.role,[m
     };[m
 [m
[1mdiff --git a/queues/bull.queues.js b/queues/bull.queues.js[m
[1mdeleted file mode 100644[m
[1mindex 992c4d4..0000000[m
[1m--- a/queues/bull.queues.js[m
[1m+++ /dev/null[m
[36m@@ -1,43 +0,0 @@[m
[31m-const Bull = require("bull");[m
[31m-const {[m
[31m-  sendEmail,[m
[31m-  createSubscriptionNotification,[m
[31m-} = require("../jobs/bull.jobs");[m
[31m-const emailNotificationQueue = new Bull("emailNotifications", {[m
[31m-  redis: { host: "127.0.0.1", port: 6379 },[m
[31m-});[m
[31m-[m
[31m-const realTimeNotificationQueue = new Bull("realTimeNotifications", {[m
[31m-  redis: { host: "127.0.0.1", port: 6379 },[m
[31m-});[m
[31m-[m
[31m-emailNotificationQueue[m
[31m-  .isReady()[m
[31m-  .then(() => {[m
[31m-    console.log("Bull email is connected to Redis");[m
[31m-  })[m
[31m-  .catch((error) => {[m
[31m-    console.error("Bull is not connected to Redis", error);[m
[31m-  });[m
[31m-[m
[31m-realTimeNotificationQueue[m
[31m-  .isReady()[m
[31m-  .then(() => {[m
[31m-    console.log("Bull realtime is  connected to Redis");[m
[31m-  })[m
[31m-  .catch((error) => {[m
[31m-    console.error("Bull is not connected to Redis", error);[m
[31m-  });[m
[31m-[m
[31m-emailNotificationQueue.process(async (jobData) => {[m
[31m-  await sendEmail(jobData);[m
[31m-});[m
[31m-[m
[31m-realTimeNotificationQueue.process(async (job) => {[m
[31m-  await createSubscriptionNotification(job);[m
[31m-});[m
[31m-[m
[31m-module.exports = {[m
[31m-  emailNotificationQueue,[m
[31m-  realTimeNotificationQueue,[m
[31m-};[m
[1mdiff --git a/redis/instance/client.js b/redis/instance/client.js[m
[1mdeleted file mode 100644[m
[1mindex a8d782c..0000000[m
[1m--- a/redis/instance/client.js[m
[1m+++ /dev/null[m
[36m@@ -1,32 +0,0 @@[m
[31m-const redis = require("redis");[m
[31m-[m
[31m-const client = redis.createClient();[m
[31m-[m
[31m-const addValue = async (key, value) => {[m
[31m-  try {[m
[31m-    if (Array.isArray(value)) {[m
[31m-      await client.sAdd(key, value);[m
[31m-    } else {[m
[31m-      const reply = await client.set(key, value);[m
[31m-      console.log(reply);[m
[31m-    }[m
[31m-  } catch (err) {[m
[31m-    console.error("Error adding value to Redis:", err);[m
[31m-  }[m
[31m-};[m
[31m-[m
[31m-const setKeyExpire = async (key, time = 300) => {[m
[31m-  await client.expire(key, time);[m
[31m-};[m
[31m-[m
[31m-const removeKey = async (redisKey) => {[m
[31m-  const exists = await client.exists(redisKey);[m
[31m-  if (exists) {[m
[31m-    await client.del(redisKey);[m
[31m-    console.log(`Removed key: ${redisKey}`);[m
[31m-  } else {[m
[31m-    console.log(`Key ${redisKey} not found in Redis`);[m
[31m-  }[m
[31m-};[m
[31m-[m
[31m-module.exports = { client, addValue, setKeyExpire, removeKey };[m
[1mdiff --git a/redis/instance/index.js b/redis/instance/index.js[m
[1mdeleted file mode 100644[m
[1mindex 19cbf00..0000000[m
[1m--- a/redis/instance/index.js[m
[1m+++ /dev/null[m
[36m@@ -1,8 +0,0 @@[m
[31m-const { client } = require("./client");[m
[31m-const { subscriber, publisher } = require("./notification.pub-sub");[m
[31m-[m
[31m-module.exports = {[m
[31m-  client,[m
[31m-  subscriber,[m
[31m-  publisher,[m
[31m-};[m
[1mdiff --git a/redis/instance/notification.pub-sub.js b/redis/instance/notification.pub-sub.js[m
[1mdeleted file mode 100644[m
[1mindex fcd50bb..0000000[m
[1m--- a/redis/instance/notification.pub-sub.js[m
[1m+++ /dev/null[m
[36m@@ -1,9 +0,0 @@[m
[31m-const redis = require("redis");[m
[31m-[m
[31m-const publisher = redis.createClient();[m
[31m-const subscriber = redis.createClient();[m
[31m-[m
[31m-module.exports = {[m
[31m-  publisher,[m
[31m-  subscriber,[m
[31m-};[m
[1mdiff --git a/redis/redis.js b/redis/redis.js[m
[1mdeleted file mode 100644[m
[1mindex 6d27713..0000000[m
[1m--- a/redis/redis.js[m
[1m+++ /dev/null[m
[36m@@ -1,19 +0,0 @@[m
[31m-const redisInstances = require("./instance");[m
[31m-[m
[31m-const connectRedis = async () => {[m
[31m-  for (const [name, instance] of Object.entries(redisInstances)) {[m
[31m-    try {[m
[31m-      await instance.connect();[m
[31m-      console.log(`Redis connect to instance ${name}`);[m
[31m-[m
[31m-      instance.on("error", (err) => {[m
[31m-        console.error(`Redis ${name} Error:`, err);[m
[31m-      });[m
[31m-    } catch (error) {[m
[31m-      console.error(`Failed to connect to Redis instance ${name}:`, error);[m
[31m-      process.exit(1);[m
[31m-    }[m
[31m-  }[m
[31m-};[m
[31m-[m
[31m-module.exports = { connectRedis };[m
[1mdiff --git a/routes/user/video.js b/routes/user/video.js[m
[1mindex 1555a37..24a1701 100644[m
[1m--- a/routes/user/video.js[m
[1m+++ b/routes/user/video.js[m
[36m@@ -31,7 +31,7 @@[m [mrouter.post([m
 [m
 router.route("/").get(getVideos);[m
 [m
[31m-router.route("/delete-many").delete(deleteManyVideos);[m
[32m+[m[32mrouter.route("/delete-many").post(deleteManyVideos);[m
 [m
 router[m
   .route("/:id")[m
[1mdiff --git a/service/notification/notification.js b/service/notification/notification.js[m
[1mindex 878dd59..ac674ee 100644[m
[1m--- a/service/notification/notification.js[m
[1m+++ b/service/notification/notification.js[m
[36m@@ -1,20 +1,30 @@[m
[31m-const { publisher } = require("../../redis/instance/notification.pub-sub");[m
[32m+[m[32mconst nodemailer = require("nodemailer");[m
[32m+[m[32mconst Bull = require("bull");[m
[32m+[m[32mconst { publisher } = require("./redis");[m
 const { Notification } = require("../../models");[m
[31m-const { clientTransporter } = require("../../utils/email");[m
 [m
[31m-const {[m
[31m-  emailNotificationQueue,[m
[31m-  realTimeNotificationQueue,[m
[31m-} = require("../../queues/bull.queues");[m
[32m+[m[32mconst notificationQueue = new Bull("notifications", {[m
[32m+[m[32m  redis: { host: "127.0.0.1", port: 6379 },[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32mconst transporter = nodemailer.createTransport({[m
[32m+[m[32m  service: "gmail",[m
[32m+[m[32m  host: "smtp.gmail.com",[m
[32m+[m[32m  port: 587,[m
[32m+[m[32m  secure: false,[m
[32m+[m[32m  auth: {[m
[32m+[m[32m    user: process.env.EMAIL,[m
[32m+[m[32m    pass: process.env.SMTP_PASSWORD,[m
[32m+[m[32m  },[m
[32m+[m[32m  tls: {[m
[32m+[m[32m    rejectUnauthorized: false,[m
[32m+[m[32m  },[m
[32m+[m[32m});[m
 [m
 const sendRealTimeNotification = async (userId, type, message) => {[m
   try {[m
[31m-    if (type !== "subscription") {[m
[31m-      const notification = await Notification.create({ userId, type, message });[m
[31m-      publisher.publish(`user:${userId}`, JSON.stringify(notification));[m
[31m-    } else {[m
[31m-      await realTimeNotificationQueue.add({ userId, type, message });[m
[31m-    }[m
[32m+[m[32m    const notification = await Notification.create({ userId, type, message });[m
[32m+[m[32m    publisher.publish(`user:${userId}`, JSON.stringify(notification));[m
   } catch (error) {[m
     console.error(error);[m
   }[m
[36m@@ -22,22 +32,30 @@[m [mconst sendRealTimeNotification = async (userId, type, message) => {[m
 [m
 const sendEmailNotification = async (email, subject, content) => {[m
   try {[m
[31m-    await clientTransporter.sendMail({[m
[32m+[m[32m    await transporter.sendMail({[m
       from: process.env.EMAIL,[m
       to: email,[m
       subject: subject,[m
       html: content,[m
     });[m
   } catch (error) {[m
[31m-    console.log(error);[m
[31m-    await emailNotificationQueue[m
[31m-      .add({ email, subject, content }, { attempts: 3, backoff: 5000 })[m
[31m-      .then(() => {[m
[31m-        console.log("job added");[m
[31m-      });[m
[32m+[m[32m    await notificationQueue.add([m
[32m+[m[32m      { email, subject, content },[m
[32m+[m[32m      { attempts: 3, backoff: 5000 },[m
[32m+[m[32m    );[m
   }[m
 };[m
 [m
[32m+[m[32mnotificationQueue.process(async (jobData) => {[m
[32m+[m[32m  const { email, subject, content } = jobData;[m
[32m+[m[32m  await transporter.sendMail({[m
[32m+[m[32m    from: process.env.EMAIL,[m
[32m+[m[32m    to: email,[m
[32m+[m[32m    subject: subject,[m
[32m+[m[32m    html: content,[m
[32m+[m[32m  });[m
[32m+[m[32m});[m
[32m+[m
 module.exports = {[m
   sendRealTimeNotification,[m
   sendEmailNotification,[m
[1mdiff --git a/service/notification/redis.js b/service/notification/redis.js[m
[1mnew file mode 100644[m
[1mindex 0000000..266911f[m
[1m--- /dev/null[m
[1m+++ b/service/notification/redis.js[m
[36m@@ -0,0 +1,38 @@[m
[32m+[m[32mconst redis = require("redis");[m
[32m+[m
[32m+[m[32mconst publisher = redis.createClient();[m
[32m+[m[32mconst subscriber = redis.createClient();[m
[32m+[m[32mconst client = redis.createClient();[m
[32m+[m
[32m+[m[32mconst connectRedis = async () => {[m
[32m+[m[32m  try {[m
[32m+[m[32m    // Wait for both clients to connect[m
[32m+[m[32m    await publisher.connect();[m
[32m+[m[32m    await subscriber.connect();[m
[32m+[m
[32m+[m[32m    // Log when both are connected[m
[32m+[m[32m    console.log("Publisher connected to Redis.");[m
[32m+[m[32m    console.log("Subscriber connected to Redis.");[m
[32m+[m[32m  } catch (error) {[m
[32m+[m[32m    // Handle connection errors[m
[32m+[m[32m    console.error("Failed to connect to Redis:", error);[m
[32m+[m[32m    process.exit(1); // Exit the process if Redis connection fails[m
[32m+[m[32m  }[m
[32m+[m[32m};[m
[32m+[m
[32m+[m[32m// Call the connectRedis function to establish connection[m
[32m+[m[32mconnectRedis();[m
[32m+[m
[32m+[m[32m// Optionally add error handling[m
[32m+[m[32mpublisher.on("error", (err) => {[m
[32m+[m[32m  console.error("Error with Redis publisher:", err);[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32msubscriber.on("error", (err) => {[m
[32m+[m[32m  console.error("Error with Redis subscriber:", err);[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32mmodule.exports = {[m
[32m+[m[32m  publisher,[m
[32m+[m[32m  subscriber,[m
[32m+[m[32m};[m
[1mdiff --git a/socket/socket.js b/service/socket.js[m
[1msimilarity index 82%[m
[1mrename from socket/socket.js[m
[1mrename to service/socket.js[m
[1mindex d919d43..bfdd752 100644[m
[1m--- a/socket/socket.js[m
[1m+++ b/service/socket.js[m
[36m@@ -1,7 +1,7 @@[m
 const { Server } = require("socket.io");[m
[31m-const { UnauthenticatedError } = require("../errors");[m
[32m+[m[32mconst { InternalServerError, UnauthenticatedError } = require("../errors");[m
 const { User } = require("../models");[m
[31m-const { notificationHandler } = require("./handlers");[m
[32m+[m[32mconst { subscriber } = require("./notification/redis");[m
 const jwt = require("jsonwebtoken");[m
 let io;[m
 [m
[36m@@ -49,11 +49,13 @@[m [mmodule.exports = {[m
     io.on("connection", async (socket) => {[m
       console.log("User connected");[m
 [m
[31m-      const { unsubscribe } = notificationHandler(socket);[m
[32m+[m[32m      subscriber.subscribe(`user:${socket.user.userId}`, (message) => {[m
[32m+[m[32m        socket.emit("notification", JSON.parse(message));[m
[32m+[m[32m      });[m
 [m
       socket.on("disconnect", () => {[m
         console.log("User disconnected");[m
[31m-        unsubscribe();[m
[32m+[m[32m        subscriber.unsubscribe(`user:${socket.user.userId}`);[m
       });[m
     });[m
   },[m
[1mdiff --git a/socket/handlers/hanlder.notification.js b/socket/handlers/hanlder.notification.js[m
[1mdeleted file mode 100644[m
[1mindex 3c6267a..0000000[m
[1m--- a/socket/handlers/hanlder.notification.js[m
[1m+++ /dev/null[m
[36m@@ -1,25 +0,0 @@[m
[31m-const { unsubscribe } = require("../../routes/admin");[m
[31m-const { subscriber } = require("../../redis/instance/notification.pub-sub");[m
[31m-[m
[31m-const notificationSubscribe = (socket) => {[m
[31m-  subscriber.subscribe(`user:${socket.user.userId}`, (message) => {[m
[31m-    socket.emit("notification", JSON.parse(message));[m
[31m-  });[m
[31m-};[m
[31m-[m
[31m-const notificationUnsubscribe = (socket) => {[m
[31m-  subscriber.unsubscribe(`user:${socket.user.userId}`);[m
[31m-};[m
[31m-[m
[31m-const notificationHandler = (socket) => {[m
[31m-  subscriber.subscribe(`user:${socket.user.userId}`, (message) => {[m
[31m-    socket.emit("notification", JSON.parse(message));[m
[31m-  });[m
[31m-  return {[m
[31m-    unsubscribe: () => {[m
[31m-      subscriber.unsubscribe(`user:${socket.user.userId}`);[m
[31m-    },[m
[31m-  };[m
[31m-};[m
[31m-[m
[31m-module.exports = notificationHandler;[m
[1mdiff --git a/socket/handlers/index.js b/socket/handlers/index.js[m
[1mdeleted file mode 100644[m
[1mindex 08470eb..0000000[m
[1m--- a/socket/handlers/index.js[m
[1m+++ /dev/null[m
[36m@@ -1,5 +0,0 @@[m
[31m-const notificationHandler = require("./hanlder.notification");[m
[31m-[m
[31m-module.exports = {[m
[31m-  notificationHandler,[m
[31m-};[m
[1mdiff --git a/utils/email.js b/utils/email.js[m
[1mdeleted file mode 100644[m
[1mindex 8400514..0000000[m
[1m--- a/utils/email.js[m
[1m+++ /dev/null[m
[36m@@ -1,8 +0,0 @@[m
[31m-const nodemailer = require("nodemailer");[m
[31m-const { clientEmailConfig } = require("../config/nodeMailer");[m
[31m-[m
[31m-const clientTransporter = nodemailer.createTransport(clientEmailConfig);[m
[31m-[m
[31m-module.exports = {[m
[31m-  clientTransporter,[m
[31m-};[m
