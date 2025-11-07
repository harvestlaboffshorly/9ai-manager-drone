module.exports = {
  apps: [
    {
      name: "9ai-drone",
      script: "dist/server.js",
      cwd: "/apps/9ai-manager-drone",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
