const backup = require('./backup');
const express = require('express')
const cron = require('node-cron');
const app = express();
const port = 8080


const server = app.listen(port, async () => {
  console.log(`Schedular started at ${new Date().toLocaleString()}`);
  cron.schedule('* * * * *', async function () {
    await backup.init();
  });

  // process.on('SIGTERM', () => {
  //   server.close();
  // });

  // process.kill(process.pid, 'SIGTERM')
});