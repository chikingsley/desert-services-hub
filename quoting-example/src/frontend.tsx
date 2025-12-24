/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { APIProvider } from "@vis.gl/react-google-maps";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const GOOGLE_MAPS_API_KEY = "AIzaSyDQXjhi_eV-FwCo28tEcT9_TFndd6wG1Gg";

const elem = document.getElementById("root");
if (!elem) {
  throw new Error("Root element not found");
}

// Note: StrictMode removed due to compatibility issues with @react-pdf/renderer
const app = (
  <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
    <App />
  </APIProvider>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  if (!import.meta.hot.data.root) {
    import.meta.hot.data.root = createRoot(elem);
  }
  import.meta.hot.data.root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
