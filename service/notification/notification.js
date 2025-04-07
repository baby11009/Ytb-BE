const { publisher } = require("../../redis/instance/notification.pub-sub");
const { Notification } = require("../../models");
const { clientTransporter } = require("../../utils/email");

const {
  emailNotificationQueue,
  realTimeNotificationQueue,
} = require("../../queues/bull.queues");

const sendRealTimeNotification = async ({
  senderId,
  receiverId,
  type,
  videoId,
  cmtId,
  message,
}) => {
  try {
    const data = {
      sender_user_id: senderId,
      receiver_user_id: receiverId,
      type,
      message,
    };

    if (videoId) {
      data.video_id = videoId;
    } else if (cmtId) {
      data.comment_id = cmtId;
    }

    if (type !== "subscription") {
      const notification = await Notification.create(data);

      const pipeline = [
        {
          $match: { _id: notification._id },
        },
        {
          $lookup: {
            from: "users",
            localField: "sender_user_id",
            foreignField: "_id",
            pipeline: [{ $project: { email: 1, name: 1, avatar: 1 } }],
            as: "sender_user_info",
          },
        },
        {
          $unwind: "$sender_user_info",
        },
      ];

      if (videoId) {
        pipeline.push(
          {
            $lookup: {
              from: "videos",
              localField: "video_id",
              foreignField: "_id",
              pipeline: [{ $project: { thumb: 1 } }],
              as: "video_info",
            },
          },
          { $unwind: "$video_info" },
        );
      } else if (cmtId) {
        pipeline.push(
          {
            $lookup: {
              from: "comments",
              localField: "comment_id",
              foreignField: "_id",
              pipeline: [
                {
                  $lookup: {
                    from: "videos",
                    localField: "video_id",
                    foreignField: "_id",
                    pipeline: [{ $project: { thumb: 1 } }],
                    as: "video_info",
                  },
                },
                { $unwind: "$video_info" },
                {
                  $project: {
                    video_info: 1,
                    replied_cmt_id: 1,
                    replied_parent_cmt_id: 1,
                  },
                },
              ],
              as: "comment_info",
            },
          },
          { $unwind: "$comment_info" },
        );
      }

      pipeline.push({
        $project: {
          sender_user_info: 1,
          video_info: { $ifNull: ["$video_info", null] },
          video_info: { $ifNull: ["$comment_info", null] },
          message: 1,
          readed: 1,
        },
      });

      // get all relative collection and return
      const notiData = await Notification.aggregate(pipeline);
      publisher.publish(`user:${receiverId}`, JSON.stringify(notiData[0]));
    } else {
      await realTimeNotificationQueue.add({
        senderId,
        receiverId,
        type,
        message,
      });
    }
  } catch (error) {
    console.error(error);
  }
};

const sendEmailNotification = async (email, subject, content) => {
  try {
    await clientTransporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: subject,
      html: content,
    });
  } catch (error) {
    console.log(error);
    await emailNotificationQueue
      .add({ email, subject, content }, { attempts: 3, backoff: 5000 })
      .then(() => {
        console.log("job added");
      });
  }
};

module.exports = {
  sendRealTimeNotification,
  sendEmailNotification,
};
