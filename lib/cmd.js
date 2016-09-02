'use strict';
const spawn = require('child_process').spawn;

module.exports = function(host, cmd, allDone) {
  const ssh = spawn('ssh', [`ubuntu@${host}`, cmd]);

  ssh.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  ssh.stderr.on('data', (data) => {
    console.log(data.toString());
  });

  ssh.on('exit', (code) => {
    if (code !== 0) {
      return allDone(code);
    }
    allDone(null, code);
  });
};

