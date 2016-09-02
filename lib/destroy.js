
const async = require('async');
const EC2 = require('./ec2');
module.exports = function(config, allDone) {
  const ec2 = new EC2(config);
  async.auto({
    instance: (done) => {
      ec2.getByName(config.server.name, (err, instance) => {
        if (err) {
          return done(err);
        }
        if (!instance) {
          return done(new Error(`Instance ${config.server.name} doesn't exist`));
        }
        done(null, instance);
      });
    },
    terminate: ['instance', (results, done) => {
      ec2.terminate(results.instance.InstanceId, done);
    }]
  }, (err, results) => {
    if (err) {
      return allDone(err);
    }
    allDone(null, results);
  });
};

