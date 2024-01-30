import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.port || 3000;
const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://e05-tracker.vercel.app",
  },
  pingTimeout: 60000,
  connectionStateRecovery: {},
});

let current_cp_count = 0;

io.on("connection", (socket) => {
  socket.emit("loadData", { current_cp_count });
  //console.log("CONNECTED");

  socket.on("lapCompleted", (message) => {
    //console.log('data received:', message);
    io.emit("lapCompletedResponse", message);
  });
  socket.on("cpCompleted", (message) => {
    //console.log('data received:', message);
    current_cp_count = message.current_cp_count;
    io.emit("cpCompletedResponse", message);
  });
  socket.on("reset", () => {
    io.emit("resetResponse");
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
