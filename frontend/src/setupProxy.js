const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function configureProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8001",
      changeOrigin: true,
    })
  );
};