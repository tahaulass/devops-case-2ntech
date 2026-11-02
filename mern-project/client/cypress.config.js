const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    // Override with CYPRESS_BASE_URL (e.g. http://localhost:8080 for docker-compose,
    // http://mern.localhost for the Kubernetes Ingress).
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:3000",
    supportFile: "cypress/support/e2e.js",
    video: false,
  },
});
