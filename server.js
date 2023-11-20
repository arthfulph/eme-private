const express = require("express");
const path = require("path");
const bodyparser = require("body-parser");
const session = require("express-session");

const app = express();
const dotenv = require("dotenv");
const connectDB = require("./Server/database/connection");

dotenv.config({ path: "config.env" });
const PORT = process.env.PORT || 8080;

connectDB();
app.use(bodyparser.urlencoded({ extended: true }));
app.use(bodyparser.json());

app.set("view engine", "ejs");

app.use(express.static('public'));
app.use("/css", express.static(path.resolve(__dirname, "Assets/css")));
app.use("/img", express.static(path.resolve(__dirname, "Assets/img")));
app.use("/js", express.static(path.resolve(__dirname, "Assets/js")));
app.use(
  "/admin-assets",
  express.static(path.resolve(__dirname, "Assets/admin/assets"))
);

app.get('/premium', (req, res) => {
  res.sendFile(path.join(__dirname, 'premium.html'));
  
});

app.use(
  session({
    secret: "whateverthesecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: false,
    },
  })
);

app.use("/", require("./Server/routes/router"));

var server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const io = require("socket.io")(server, {
  allowEIO3: true,
});
const adminNamespace = io.of("/admin");

var userConnection = [];
const engagedUsers = [];
const lockedChatRooms = [];

function findUnengagedUser(username) {
  const unengagedUsers = userConnection.filter(
    (user) =>
      user.user_id !== username &&
      !user.engaged &&
      !engagedUsers.includes(user.user_id) &&
      !lockedChatRooms.includes(user.connectionId)
  );

  if (unengagedUsers.length > 0) {
    const selectedUser =
      unengagedUsers[Math.floor(Math.random() * unengagedUsers.length)];
    engagedUsers.push(username, selectedUser.user_id);
    lockedChatRooms.push(selectedUser.connectionId);

    if (engagedUsers.length > 2) {
      const removedUser = engagedUsers.shift();
      const removedUserObj = userConnection.find(
        (user) => user.user_id === removedUser
      );
      if (removedUserObj) {
        removedUserObj.engaged = false;
      }
    }

    return selectedUser;
  }

  return null;
}

io.on("connection", (socket) => {
  console.log("Socket id is: ", socket.id);
  socket.emit("mySocketId", socket.id);
  socket.on("userconnect", (data) => {
    console.log("Logged in username", data.displayName);
    userConnection.push({
      connectionId: socket.id,
      user_id: data.displayName,
      engaged: false,
    });

    io.of("/admin").emit("userinfo", userConnection);
  });

  socket.on("findUnengagedUser", (data) => {
    const unengagedUser = findUnengagedUser(data.username);

    if (unengagedUser) {
      const senderUser = userConnection.find(
        (user) => user.connectionId === socket.id
      );

      if (senderUser) {
        senderUser.engaged = true;
      }

      unengagedUser.engaged = true;
      socket.emit("startChat", unengagedUser.connectionId);
    }
  });

  socket.on("findNextUnengagedUser", (data) => {
    const availableUsers = userConnection.filter(
      (user) =>
        !user.engaged &&
        user.connectionId !== socket.id &&
        user.connectionId !== data.remoteUser &&
        !lockedChatRooms.includes(user.connectionId)
    );

    if (availableUsers.length > 0) {
      const randomUser =
        availableUsers[Math.floor(Math.random() * availableUsers.length)];
      randomUser.engaged = true;
      lockedChatRooms.push(randomUser.connectionId);

      socket.emit("startChat", randomUser.connectionId);
    }
  });

  socket.on("offerSentToRemote", (data) => {
    var offerReceiver = userConnection.find(
      (o) => o.user_id === data.remoteUser
    );
    if (offerReceiver) {
      socket.to(offerReceiver.connectionId).emit("ReceiveOffer", data);
    }
  });

  socket.on("answerSentToUser1", (data) => {
    var answerReceiver = userConnection.find(
      (o) => o.user_id === data.receiver
    );
    if (answerReceiver) {
      socket.to(answerReceiver.connectionId).emit("ReceiveAnswer", data);
    }
  });

  socket.on("candidateSentToUser", (data) => {
    var candidateReceiver = userConnection.find(
      (o) => o.user_id === data.remoteUser
    );
    if (candidateReceiver) {
      socket.to(candidateReceiver.connectionId).emit("candidateReceiver", data);
    }
  });

  socket.on("disconnect", () => {
    userConnection = userConnection.filter((p) => p.connectionId !== socket.id);
    io.of("/admin").emit("userinfo", userConnection);
  });

  socket.on("remoteUserClosed", (data) => {
    var closedUser = userConnection.find((o) => o.user_id === data.remoteUser);
    if (closedUser) {
      closedUser.engaged = false;
      socket.to(closedUser.connectionId).emit("closedRemoteUser", data);
    }
  });
});

adminNamespace.on("connection", (socket) => {
  console.log("An admin panel user connected");

  socket.on("requestUserData", () => {
    socket.emit("userData", Object.values(userConnection));
  });
});
