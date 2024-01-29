import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.port || 3000;
const app = express();
const server = createServer(app);

const io = new Server(server);

io.on("connection", (socket) => {
  socket.emit("eventFromServer", "Hello, World 👋");

  socket.on("lapCompleted", (message) => {
    //console.log('data received:', message);
    io.emit("lapCompletedResponse", message);
  });
  socket.on("cpCompleted", (message) => {
    //console.log('data received:', message);
    io.emit("cpCompletedResponse", message);
  });
  socket.on("reset", () => {
    io.emit("resetResponse");
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
