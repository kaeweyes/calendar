
// ===== App.jsx (unchanged, included for completeness) =====
// Save this as App.jsx

import React from "react";
import MonthView from "./monthView";
import Home from "./home";
import { BrowserRouter, Routes, Route } from "react-router-dom";

function AppRoot() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/month" element={<MonthView />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoot;
