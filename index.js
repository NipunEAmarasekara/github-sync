const backup = require('./backup');
const express = require('express')
const cron = require('node-cron');
const app = express();
const port = 8080


const server = app.listen(port, async () => {
  console.log(`Automatic github backup process is started`);
  cron.schedule('* * * * *', async function () {
    await backup.init();
  });

  // process.on('SIGTERM', () => {
  //   server.close();
  // });

  // process.kill(process.pid, 'SIGTERM')
});