module.exports = {
  apps: [
    {
      name: "9ai-drone",
      script: "dist/server.js",
      cwd: "./",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
