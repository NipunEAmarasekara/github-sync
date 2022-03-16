const backup = require('./backup');
const express = require('express')
const app = express();
const port = 8080


const server = app.listen(port, async () => {
  console.log(`Automatic github backup process is started`);
  await backup.init();
  
  process.on('SIGTERM', () => {
    server.close();
  });

  process.kill(process.pid, 'SIGTERM')
});