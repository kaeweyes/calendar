// mainServer.cjs
const express = require("express");
const cors = require("cors");
const path = require("path");

const eventsRouter = require("./server.cjs");
const unscheduledRouter = require("./unscheduled.cjs");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// mount routers
app.use("/events", eventsRouter);
app.use("/unscheduled", unscheduledRouter);

// simple health
app.get("/", (req, res) => {
  res.send({ status: "ok", endpoints: ["/events", "/unscheduled"] });
});

app.listen(PORT, () => {
  console.log(`Main server listening on http://localhost:${PORT}`);
});
