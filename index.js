const backup = require('./backup');
const express = require('express')
const cron = require('node-cron');
const app = express();
const port = 8080

async function scheduler(mode) {
  //Time format -> min hour day-of-month month day-of-week
  // 0 0 * * * = midnight
  cron.schedule('0 0 * * *', async function () {
    console.log(`Schedular started at ${new Date().toLocaleString()}`);
    backup.writeLog(`Sync log ${(new Date()).toLocaleString()}`);
    await backup.init(mode);
  });
}

async function onetime(mode) {
  backup.writeLog(`Sync log ${(new Date()).toLocaleString()}`);
  await backup.init(mode).then(() => {
    process.on('SIGTERM', () => {
      server.close();
    });
    process.kill(process.pid, 'SIGTERM');
  });
}

const server = app.listen(port, async () => {
  //Check for modes
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      await scheduler();
    } else if (args.filter(arg => arg === 'onetime').length) {
      await onetime(args.filter(arg => arg !== 'onetime')[0]);
    } else {
      await scheduler(args[0]);
    }
  } catch (e) {
    console.log(e);
  }
});