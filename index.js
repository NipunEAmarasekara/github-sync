const backup = require('./backup');
const express = require('express')
const cron = require('node-cron');
const app = express();
const port = 8080


const server = app.listen(port, async () => {

  //Check for arguments
  if (process.argv.slice(2).filter(arg => arg === 'onetime').length) {
    await backup.init();
  } else {
    //Time format -> min hour day-of-month month day-of-week
    cron.schedule('0 0 * * *', async function () {
      console.log(`Schedular started at ${new Date().toLocaleString()}`);
      await backup.init();
    });
  }

  // process.on('SIGTERM', () => {
  //   server.close();
  // });

  // process.kill(process.pid, 'SIGTERM')
});