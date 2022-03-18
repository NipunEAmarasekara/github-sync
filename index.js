const backup = require('./backup');
const express = require('express')
const cron = require('node-cron');
const app = express();
const port = 8080


const server = app.listen(port, async () => {
  cron.schedule('* * * * *', async function () {
    console.log(`Schedular started at ${new Date().toLocaleString()}`);
    await backup.init();
  });

  // process.on('SIGTERM', () => {
  //   server.close();
  // });

  // process.kill(process.pid, 'SIGTERM')
});