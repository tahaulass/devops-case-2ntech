// Single place for the API base URL.
// Default is a same-origin relative path ("/api"): the browser calls the same host that
// served the UI, and nginx (docker-compose) or the Ingress (Kubernetes) routes /api to the
// backend. The starter code hard-coded http://localhost:5050 in every component, which only
// works on a developer laptop.
// For `npm start` development, set REACT_APP_API_URL=http://localhost:5050/api.
export const API_URL = (process.env.REACT_APP_API_URL || "/api").replace(/\/$/, "");
