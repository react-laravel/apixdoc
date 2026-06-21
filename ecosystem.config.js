module.exports = {
  apps: [
    {
      name: process.env.PM2_APP || "apixdoc-nextjs",
      cwd: process.env.PM2_CWD || __dirname,
      script: "npm",
      args: "run start -- --hostname 127.0.0.1 --port " + (process.env.PORT || "3002"),
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3002",
        PATH: "/home/actions-runner/.nvm/versions/node/v24.16.0/bin:/home/actions-runner/.local/bin:/usr/local/bin:/usr/bin:/bin",
      },
      error_file: (process.env.APP_ROOT || "/var/www/apixdoc") + "/logs/error.log",
      out_file: (process.env.APP_ROOT || "/var/www/apixdoc") + "/logs/out.log",
      merge_logs: true,
      max_memory_restart: "512M",
    },
  ],
};
