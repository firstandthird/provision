
const async = require('async');
const EC2 = require('./ec2');
const Route53 = require('./route53');
module.exports = function(config, allDone) {
  const ec2 = new EC2(config);
  const route53 = new Route53(config);
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
    }],
    dns: ['instance', (results, done) => {
      if (this.config.host) {
        return route53.run(results.instance.PublicIpAddress, 'remove', done);
      }

      done();
    }]
  }, (err, results) => {
    if (err) {
      return allDone(err);
    }
    allDone(null, results);
  });
};

