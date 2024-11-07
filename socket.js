const { Server } = require("socket.io");
const { InternalServerError, UnauthenticatedError } = require("./errors");
const { User } = require("./models");
const jwt = require("jsonwebtoken");
let io;

module.exports = {
  init: (httpServer) => {
    io = new Server(httpServer, {
      cors: { origin: "http://localhost:5173/" },
    });
    io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new UnauthenticatedError("Authentication invalid"));
      }

      try {
        // Verify the JWT token
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch the user based on the token payload
        const user = await User.findById(payload.userId).select("-password");

        if (!user) {
          return next(new UnauthenticatedError("User not found"));
        }

        if (user.confirmed === false) {
          return next(new BadRequestError("Account not confirmed"));
        }

        // Attach user information to the socket
        socket.user = {
          userId: payload.userId,
          name: user.username,
          role: user.role,
        };

        // Proceed to the next middleware or connection
        next();
      } catch (err) {
        // Handle any errors (like invalid or expired token)
        return next(new UnauthenticatedError("Invalid or expired token"));
      }
    });
    io.on("connection", (socket) => {
      console.log("User connected");
      socket.on("disconnect", () => {
        console.log("User disconnected");
      });
    });
  },
  getIo: () => {
    if (!io) {
      throw new InternalServerError("Socket.io not initialized!");
    }
    return io;
  },
};
