
const async = require('async');
const EC2 = require('./ec2');
const obj2args = require('obj2args');
const cmd = require('./cmd');

module.exports = function(config, allDone) {
  const ec2 = new EC2(config);

  const runContainer = (host, cConfig, done) => {
    if (!cConfig.enabled) {
      return done();
    }
    const args = obj2args(cConfig.args);
    cmd(host, `(docker-srm ${cConfig.args.name} || true) && docker run ${args} ${cConfig.image}`, done);
  };

  async.auto({
    ec2: (done) => {
      ec2.run(done);
    },

    host: ['ec2', (results, done) => {
      const reservation = results.ec2.Reservations[0];
      const instance = reservation.Instances[0];
      const publicDns = instance.NetworkInterfaces[0].Association.PublicDnsName;
      done(null, publicDns);
    }],

    nginx: ['host', (results, done) => {
      runContainer(results.host, config.nginx, done);
    }],

    dockerGen: ['nginx', 'host', (results, done) => {
      runContainer(results.host, config.dockergen, done);
    }],

    deploy: ['host', (results, done) => {
      runContainer(results.host, config.deploy, done);
    }]
  }, (err, results) => {
    if (err) {
      return allDone(err);
    }
    allDone(null, results);
  });
};
