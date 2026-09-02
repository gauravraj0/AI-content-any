import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { StudioProvider } from "./lib/store";
import { ToastHost } from "./components/ui";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ToastHost>
        <StudioProvider>
          <App />
        </StudioProvider>
      </ToastHost>
    </BrowserRouter>
  </StrictMode>
);
