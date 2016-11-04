
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
    cmd(host, `(docker inspect ${cConfig.args.name} > /dev/null) || docker run ${args} ${cConfig.image} ${cConfig.command || ''}`, done);
  };

  async.auto({
    ec2: (done) => {
      ec2.run(done);
    },
    nginx: ['ec2', (results, done) => {
      runContainer(results.ec2.host, config.nginx, done);
    }],

    dockerGen: ['nginx', 'ec2', (results, done) => {
      runContainer(results.ec2.host, config.dockergen, done);
    }],

    deploy: ['ec2', (results, done) => {
      runContainer(results.ec2.host, config.deploy, done);
    }],

    letsencrypt: ['ec2', 'nginx', 'dockerGen', (results, done) => {
      runContainer(results.ec2.host, config.letsencrypt, done);
    }],

    mongo: ['ec2', (results, done) => {
      runContainer(results.ec2.host, config.mongo, done);
    }],

    logspout: ['ec2', (results, done) => {
      runContainer(results.ec2.host, config.logspout, done);
    }]
  }, (err, results) => {
    if (err) {
      return allDone(err);
    }
    allDone(null, results);
  });
};
