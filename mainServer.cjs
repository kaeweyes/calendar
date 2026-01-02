const express = require("express");
const cors = require("cors");
const path = require("path");

const eventsRouter = require("./server.cjs");
const unscheduledRouter = require("./unscheduled.cjs");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/events", eventsRouter);
app.use("/unscheduled", unscheduledRouter);

app.get("/", (req, res) => {
    res.send({ status: "ok", endpoints: ["/events", "/unscheduled"] });
});

app.listen(PORT, () => {
    console.log(`Main server listening on http://localhost:${PORT}`);
});
