let localStream;
let username;
let remoteUser;
const url = new URL(window.location.href);

let peerConnection;
let remoteStream;
let sendChannel;
let receiveChannel;
const msgInput = document.querySelector("#msg-input");
const msgSendBtn = document.querySelector(".msg-send-button");
const chatTextArea = document.querySelector(".chat-text-area");
const omeID = localStorage.getItem("omeID");
const socket = io.connect();

socket.on("connect", () => {
  console.log("The Socket is connected");
});

socket.on("mySocketId", (socketId) => {
  if (socket.connected) {
    username = socketId;
    socket.emit("userconnect", {
      displayName: socketId,
    });
    runUser();
  }

  console.log("My Socket ID:", socketId);
});

function runUser() {
  async function init() {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("user-1").srcObject = localStream;

    socket.emit("findUnengagedUser", {
      username: username,
    });

    socket.on("startChat", (otherUserId) => {
      console.log("Starting chat with user:", otherUserId);
      remoteUser = otherUserId;
      createOffer(otherUserId);

      // Add this to display the connection message
      document.querySelector(".chat-text-container p:first-child").style.display = "block";
    });
  }

  function createPeerConnection() {
    const servers = {
      iceServers: [
        {
          urls: [
            "stun:stun1.1.google.com:19302",
            "stun:stun2.1.google.com:19302",
          ],
        },
      ],
    };
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById("user-2").srcObject = remoteStream;
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    remoteStream.oninactive = () => {
      remoteStream.getTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      peerConnection.close();
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidateSentToUser", {
          username: username,
          remoteUser: remoteUser,
          iceCandidateData: event.candidate,
        });
      }
    };

    sendChannel = peerConnection.createDataChannel("sendDataChannel");
    sendChannel.onopen = () => {
      console.log("Data channel is now open and ready to use");
      onSendChannelStateChange();
    };

    peerConnection.ondatachannel = receiveChannelCallback;
  }

  function sendData() {
    const msgData = msgInput.value;
    chatTextArea.innerHTML += `<div style='margin-top:2px; margin-bottom:2px;'><b>Me: </b>${msgData}</div>`;
    if (sendChannel) {
      onSendChannelStateChange();
      sendChannel.send(msgData);
      msgInput.value = "";
    } else {
      receiveChannel.send(msgData);
      msgInput.value = "";
    }
  }

  function receiveChannelCallback(event) {
    console.log("Receive Channel Callback");
    receiveChannel = event.channel;
    receiveChannel.onmessage = onReceiveChannelMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;
  }

  function onReceiveChannelMessageCallback(event) {
    console.log("Received Message");
    chatTextArea.innerHTML += `<div style='margin-top:2px; margin-bottom:2px;'><b>Stranger: </b>${event.data}</div>`;
  }

  function onReceiveChannelStateChange() {
    const readystate = receiveChannel.readystate;
    console.log("Receive channel state is: " + readystate);
    if (readystate === "open") {
      console.log("Data channel ready state is open - onReceiveChannelStateChange");
    } else {
      console.log("Data channel ready state is NOT open - onReceiveChannelStateChange");
    }
  }

  function onSendChannelStateChange() {
    const readystate = sendChannel.readystate;
    console.log("Send channel state is: " + readystate);
    if (readystate === "open") {
      console.log("Data channel ready state is open - onSendChannelStateChange");
    } else {
      console.log("Data channel ready state is NOT open - onSendChannelStateChange");
    }
  }

  function fetchNextUser(remoteUser) {
    socket.emit("findNextUnengagedUser", {
      username: username,
      remoteUser: remoteUser,
    });

    socket.on("NextStartChat", (otherUserId) => {
      console.log("Starting chat with user:", otherUserId);
      remoteUser = otherUserId;
      createOffer(otherUserId);

      // Add this to display the connection message
      document.querySelector(".chat-text-container p:first-child").style.display = "block";
    });
  }

  async function createOffer(remoteU) {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offerSentToRemote", {
      username: username,
      remoteUser: remoteU,
      offer: peerConnection.localDescription,
    });
  }

  async function createAnswer(data) {
    remoteUser = data.username;
    createPeerConnection();
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answerSentToUser1", {
      answer: answer,
      sender: data.remoteUser,
      receiver: data.username,
    });
    document.querySelector(".next-chat").style.pointerEvents = "auto";
  }

  socket.on("ReceiveOffer", (data) => {
    createAnswer(data);
  });

  async function addAnswer(data) {
    if (!peerConnection.currentRemoteDescription) {
      peerConnection.setRemoteDescription(data.answer);
    }
    document.querySelector(".next-chat").style.pointerEvents = "auto";
  }

  socket.on("ReceiveAnswer", (data) => {
    addAnswer(data);
  });

  socket.on("closedRemoteUser", (data) => {
    const remotStream = peerConnection.getRemoteStreams()[0];
    remotStream.getTracks().forEach((track) => track.stop());
    peerConnection.close();
    chatTextArea.innerHTML = "";
    const remoteVid = document.getElementById("user-2");
    if (remoteVid.srcObject) {
      remoteVid.srcObject.getTracks().forEach((track) => track.stop());
      remoteVid.srcObject = null;
    }
    console.log("Closed Remote user");
    fetchNextUser(remoteUser);
  });

  socket.on("candidateReceiver", (data) => {
    peerConnection.addIceCandidate(data.iceCandidateData);
  });

  msgSendBtn.addEventListener("click", () => {
    sendData();
  });

  // Add this event listener for "Enter" key press
  msgInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendData();
      event.preventDefault();
    }
  });

  // Add this event listener for double press of "Esc" key
  let lastEscPress = 0;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const now = new Date().getTime();
      const timeSinceLastPress = now - lastEscPress;
      lastEscPress = now;
      if (timeSinceLastPress <= 300) {
        // Double press detected, trigger Next button
        document.querySelector(".next-chat").click();
      }
    }
  });

  window.addEventListener("unload", () => {
    socket.emit("remoteUserClosed", {
      username: username,
      remoteUser: remoteUser,
    });
  });

  async function closeConnection() {
    chatTextArea.innerHTML = "";
    const remotStream = peerConnection.getRemoteStreams()[0];
    remotStream.getTracks().forEach((track) => track.stop());

    await peerConnection.close();
    const remoteVid = document.getElementById("user-2");
    if (remoteVid.srcObject) {
      remoteVid.srcObject.getTracks().forEach((track) => track.stop());
      remoteVid.srcObject = null;
    }

    await socket.emit("remoteUserClosed", {
      username: username,
      remoteUser: remoteUser,
    });
    fetchNextUser(remoteUser);
  }

  $(document).on("click", ".next-chat", () => {
    chatTextArea.innerHTML = "";
    console.log("From Next Chat button");
    closeConnection();
  });

  init();
}
