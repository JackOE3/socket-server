import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;
const AUTH_TOKENS = [
  process.env.AUTH_TOKEN_ROLLIN,
  process.env.AUTH_TOKEN_JAV,
  process.env.AUTH_TOKEN_DEMON,
];

function getPlayer(token) {
  switch (token) {
    case process.env.AUTH_TOKEN_ROLLIN:
      return "rollin";
    case process.env.AUTH_TOKEN_JAV:
      return "jav";
    case process.env.AUTH_TOKEN_DEMON:
      return "demon";
    default:
      return undefined;
  }
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
  avg_lap_times: [],
  current_avg_lap: undefined,
  current_median_lap: undefined,

  current_cp_split: undefined,
  current_cp_count: 0,
  trick_start_time: undefined,
  trick_diff: [],
  trick_avg_diff: undefined,
  trick_median_diff: undefined,
};
const playerStats = {};
const players = ["rollin", "jav", "demon"];
players.forEach((player) => {
  playerStats[player] = { ...statsRaw };
});

/* io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token === AUTH_TOKEN) socket.handshake.headers.cookie = AUTH_COOKIE;
  next();
}); */

io.on("connection", (socket) => {
  socket.emit("loadData", playerStats);
  //console.log("CONNECTED");
  if (!AUTH_TOKENS.includes(socket.handshake.auth.token)) {
    console.log("no emit authentication for socket id:", socket.id);
    return;
  }

  const player = getPlayer(socket.handshake.auth.token);
  console.log("player:", player);
  if (!players.includes(player)) {
    console.log("player not found:", player);
    return;
  }

  socket.on("cpCompleted", (message) => {
    io.emit("cpCompletedResponse", { player, ...message });
    //const player = message.player;

    stats = playerStats[player];

    stats.current_cp_count = message.current_cp_count;
    stats.current_cp_split = message.current_cp_split;
    if (stats.current_cp_count % CPS_PER_LAP === 5)
      stats.trick_start_time = stats.current_cp_split;
    if (stats.current_cp_count % CPS_PER_LAP === 0) {
      const trickTime = stats.current_cp_split - stats.trick_start_time;
      // "This sector without the trick is on average exactly 21 seconds long."
      const trickDiff = (trickTime - 21000) / 1000;
      stats.trick_diff.push(trickDiff);

      const sum = stats.trick_diff.reduce((a, b) => a + b, 0);
      stats.trick_avg_diff = sum / stats.trick_diff.length || 0;
      stats.trick_median_diff = median(stats.trick_diff);

      stats.current_lap = 1 + Math.floor(stats.current_cp_count / CPS_PER_LAP);

      const previous_lap_split = stats.lap_splits[stats.lap_splits.length - 1];
      const current_lap_time =
        stats.current_cp_split - (previous_lap_split ? previous_lap_split : 0);

      stats.lap_times.push(current_lap_time);
      stats.lap_splits.push(stats.current_cp_split);

      io.emit("lapStats", {
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
        const sum = stats.lap_times.reduce((a, b) => a + b, 0);
        stats.current_avg_lap = sum / stats.lap_times.length || 0;
        stats.avg_lap_times.push(stats.current_avg_lap);
        const current_est_pace =
          stats.lap_times[0] + 59 * stats.current_avg_lap;
        stats.est_pace.push(current_est_pace);
        if (stats.lap_times.length >= 3)
          stats.current_median_lap = median(stats.lap_times.slice(1));
        //omit 1st lap

        io.emit("lapStatsExtra", {
          player,
          current_avg_lap: stats.current_avg_lap,
          current_median_lap: stats.current_median_lap,
          current_est_pace: current_est_pace,
        });
      }
    }
  });

  socket.on("reset", (message) => {
    io.emit("resetResponse", { player });
    playerStats[player] = { ...statsRaw };
    /*  stats = playerStats[player];

    stats.current_cp_count = 0;
    stats.current_cp_split = 0;
    stats.lap_times = [];
    stats.lap_splits = [];
    stats.est_pace = [0];
    stats.avg_lap_times = [];
    stats.current_avg_lap = undefined;
    stats.current_median_lap = undefined;
    stats.current_cp_split = 0;
    stats.current_cp_count = 0;
    stats.trick_diff = [];
    stats.trick_avg_diff = 0;
    stats.trick_median_diff = 0; */
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
