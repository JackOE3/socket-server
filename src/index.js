import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;
const AUTH_TOKENS = [
  process.env.AUTH_TOKEN_ROLLIN,
  process.env.AUTH_TOKEN_JAV,
  process.env.AUTH_TOKEN_DEMON,
  process.env.AUTH_TOKEN_ROTAKER,
];
const players = ["Rollin", "JaV", "Demon", "RotakeR"];

function getPlayer(token) {
  const idx = AUTH_TOKENS.findIndex((e) => e === token);
  if (idx === -1) return undefined;
  return players[idx];
}

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://e05-tracker.vercel.app",
  },
  pingTimeout: 60000,
  connectionStateRecovery: {},
});

const CPS_PER_LAP = 8;

const statsRaw = {
  current_lap: 1,
  lap_times: [],
  lap_splits: [],
  est_pace: [undefined],
  avg_lap_times: [undefined],
  current_avg_lap: undefined,
  current_median_lap: undefined,

  current_cp_split: undefined,
  current_cp_count: 0,
  trick_diff: [],
  trick_avg_diff: undefined,
  trick_median_diff: undefined,
};
const statsHidden = {
  trick_start_time: undefined,
};
const playerStats = {};
const playerStatsHidden = {};
const connected = {};

players.forEach((player) => {
  playerStats[player] = deepClone(statsRaw);
  playerStatsHidden[player] = deepClone(statsHidden);
  connected[player] = false;
});

/* io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token === AUTH_TOKEN) socket.handshake.headers.cookie = AUTH_COOKIE;
  next();
}); */

io.on("connection", (socket) => {
  socket.emit("loadData", { playerStats, connected });

  if (socket.handshake.auth.token === undefined) return;
  const player = getPlayer(socket.handshake.auth.token);
  if (player === undefined) {
    console.log("player not found:", player);
    socket.emit("player_not_found");
    return;
  }
  console.log("player connected:", player);

  connected[player] = true;
  socket.broadcast.emit("playerConnected", player);
  socket.emit("client_connected", player);

  socket.on("disconnect", () => {
    connected[player] = false;
    socket.broadcast.emit("playerDisconnected", player);
    socket.emit("client_disconnected", player);
  });

  socket.on("cpCompleted", (message) => {
    socket.broadcast.emit("cpCompletedResponse", { player, ...message });
    //const player = message.player;

    const stats = playerStats[player];
    const statsHidden = playerStatsHidden[player];

    stats.current_cp_count = message.current_cp_count;
    stats.current_cp_split = message.current_cp_split;
    if (stats.current_cp_count % CPS_PER_LAP === 5)
      statsHidden.trick_start_time = stats.current_cp_split;
    if (
      stats.current_cp_count > 0 &&
      stats.current_cp_count % CPS_PER_LAP === 0
    ) {
      const trickTime = stats.current_cp_split - statsHidden.trick_start_time;
      // "This sector without the trick is on average exactly 21 seconds long."
      const trickDiff = trickTime - 21000;
      stats.trick_diff.push(trickDiff);

      const sum = stats.trick_diff.reduce((a, b) => a + b, 0);
      stats.trick_avg_diff = sum / stats.trick_diff.length;
      stats.trick_median_diff = median(stats.trick_diff);

      stats.current_lap = 1 + Math.floor(stats.current_cp_count / CPS_PER_LAP);

      const previous_lap_split = stats.lap_splits[stats.lap_splits.length - 1];
      const current_lap_time =
        stats.current_cp_split - (previous_lap_split ? previous_lap_split : 0);

      stats.lap_times.push(current_lap_time);
      stats.lap_splits.push(stats.current_cp_split);

      socket.broadcast.emit("lapStats", {
        player,
        current_lap: stats.current_lap,
        current_lap_time: current_lap_time,
        current_lap_split: stats.current_cp_split,
        current_trick_diff: trickDiff,
        trick_avg_diff: stats.trick_avg_diff,
        trick_median_diff: stats.trick_median_diff,
      });
      // start at 2nd lap:
      if (stats.current_cp_count > CPS_PER_LAP) {
        const sum = stats.lap_times.slice(1).reduce((a, b) => a + b, 0);
        stats.current_avg_lap = sum / (stats.lap_times.length - 1);
        stats.avg_lap_times.push(stats.current_avg_lap);
        const current_est_pace =
          stats.lap_times[0] + 59 * stats.current_avg_lap;
        stats.est_pace.push(current_est_pace);
        if (stats.lap_times.length >= 3)
          stats.current_median_lap = median(stats.lap_times.slice(1));
        //omit 1st lap

        socket.broadcast.emit("lapStatsExtra", {
          player,
          current_avg_lap: stats.current_avg_lap,
          current_median_lap: stats.current_median_lap,
          current_est_pace: current_est_pace,
        });
      }
    }
  });

  socket.on("reset", (message) => {
    socket.broadcast.emit("resetResponse", { player });
    playerStats[player] = deepClone(statsRaw);
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});

function median(values) {
  if (values.length === 0) {
    throw new Error("Input array is empty");
  }
  // Sorting values, preventing original array
  // from being mutated.
  values = [...values].sort((a, b) => a - b);

  const half = Math.floor(values.length / 2);

  return values.length % 2
    ? values[half]
    : (values[half - 1] + values[half]) / 2;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
