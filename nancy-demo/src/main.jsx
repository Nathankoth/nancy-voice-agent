import "@fontsource/syne/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/dm-serif-display/400-italic.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import ReceiptSharePage from "./pages/ReceiptSharePage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/nancy/r/:id" element={<ReceiptSharePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
