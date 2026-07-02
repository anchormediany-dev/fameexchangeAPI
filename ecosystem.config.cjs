module.exports = {
  apps: [
    {
      name: "fameexchange-api",
      script: "app.js",
      // Keep at 1 until ledger serialization moves to DB-level atomic sequence.
      // Cluster mode would allow concurrent writes that break the hash chain.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 5006,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5006,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: false,
    },
  ],
};
