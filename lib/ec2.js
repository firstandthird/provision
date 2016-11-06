'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
const async = require('async');
const Route53 = require('./route53');
const Logr = require('logr');
const cmd = require('./cmd');

const log = new Logr({
  type: 'cli'
});

class EC2 {
  constructor(config) {
    this.config = config;
    this.ec2 = new AWS.EC2({
      region: this.config.server.region,
      apiVersion: '2015-10-01'
    });
    this.route53 = new Route53(config);
  }

  run(allDone) {
    async.auto({
      hasKeypair: (done) => {
        log(['debug'], 'Checking if keypair exists');
        const params = {
          KeyNames: [
            this.config.server.keypair,
          ]
        };
        this.ec2.describeKeyPairs(params, (err) => {
          done(null, (!err));
        });
      },

      keypair: ['hasKeypair', (results, done) => {
        const name = this.config.server.keypair;
        if (results.hasKeypair) {
          return done();
        }
        log(['debug'], `Creating keypair ${name}`);
        const params = {
          KeyName: name
        };
        this.ec2.createKeyPair(params, (err, data) => {
          if (err) {
            return done(err);
          }
          log(`Writing keypair ${this.config.keyPath}`);
          fs.writeFile(this.config.keyPath, data.KeyMaterial, done);
        });
      }],

      isRunning: (done) => {
        log(['debug'], 'Checking if already running');
        this.getByName(this.config.server.name, done);
      },

      userData: (done) => {
        if (!this.config.server.users) {
          return done();
        }
        log(['debug'], 'Generating user data script');
        const data = `#!/bin/bash

apt-get update
apt-get install -y linux-image-extra-\`uname -r\` make htop

#docker
curl -sSL https://get.docker.com/ | sh
usermod -aG docker ubuntu

#docker compose
DOCKER_COMPOSE_VERSION=1.8.0
curl -L https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-\`uname -s\`-\`uname -m\` > /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose

#docker extras
curl -sSL https://raw.githubusercontent.com/jgallen23/docker-extras/master/install.sh | bash

touch /home/ubuntu/.ssh/authorized_keys
${this.config.server.users.map((user) => `echo "#${user}" >> /home/ubuntu/.ssh/authorized_keys && curl https://github.com/${user}.keys >> /home/ubuntu/.ssh/authorized_keys`).join('\n')}
touch /tmp/provision_complete`;

        const userData64 = new Buffer(data).toString('base64');
        done(null, userData64);
      },

      run: ['keypair', 'isRunning', 'userData', (results, done) => {
        if (results.isRunning) {
          log(['debug'], 'Instance already exists');
          return done(null, results.isRunning);
        }
        log(['debug'], 'Creating instance');
        const instanceConfig = this.config.ec2;
        instanceConfig.UserData = results.userData;

        this.ec2.runInstances(instanceConfig, (err, data) => {
          if (err) {
            return done(err);
          }
          const instance = data.Instances[0];
          done(null, instance);
        });
      }],

      check: ['isRunning', 'run', (results, done) => {
        if (results.isRunning) {
          return done();
        }
        this.checkUntilRunning(results.run, (checkErr) => {
          if (checkErr) {
            return done(checkErr);
          }
          done(null);
        });
      }],

      tag: ['isRunning', 'check', (results, done) => {
        if (results.isRunning) {
          return done();
        }
        log(['debug'], 'Tagging Instance');
        const tags = {
          Resources: [
            results.run.InstanceId
          ],
          Tags: [
            { Key: 'Name', Value: this.config.server.name },
            { Key: 'Provision', Value: 'FirstandThird' }
          ]
        };
        this.ec2.createTags(tags, done);
      }],

      elasticIP: ['isRunning', 'run', 'tag', (results, done) => {
        if (results.isRunning) {
          return done();
        }
        log(['debug'], 'Creating Elastic IP');
        const params = {
          Domain: 'vpc',
        };
        this.ec2.allocateAddress(params, done);
      }],

      associateIP: ['isRunning', 'elasticIP', 'run', (results, done) => {
        if (results.isRunning) {
          return done();
        }
        log(['debug'], 'Associating Elastic IP');
        const params = {
          AllocationId: results.elasticIP.AllocationId,
          AllowReassociation: false,
          InstanceId: results.run.InstanceId
        };
        this.ec2.associateAddress(params, done);
      }],

      info: ['associateIP', (results, done) => {
        this.describeInstance(results.run.InstanceId, done);
      }],

      host: ['info', (results, done) => {
        const reservation = results.info.Reservations[0];
        const instance = reservation.Instances[0];
        if (instance.PublicIpAddress) {
          return done(null, instance.PublicIpAddress);
        }
        done(null, instance.PublicDnsName);
      }],

      dns: ['host', (results, done) => {
        if (this.config.host && this.config.ec2.route53 !== false) {
          return this.route53.run(results.host, 'create', done);
        }

        done();
      }],

      canSSH: ['host', (results, done) => {
        let current = 0;
        const max = 20;
        const checkSSH = (callback) => {
          log(['debug'], 'Checking if can ssh');
          cmd(results.host, 'echo "can ssh!"', (err) => {
            current++;
            if (max === current) {
              return callback(new Error('max attempts to connect via ssh'));
            }
            if (err) {
              return setTimeout(() => {
                checkSSH(callback);
              }, 5000);
            }
            callback();
          });
        };

        checkSSH((err) => {
          if (err) {
            return done(err);
          }
          done(null);
        });
      }],

      installed: ['host', 'canSSH', (results, done) => {
        let current = 0;
        const max = 20;
        const checkInstalled = (callback) => {
          log(['debug'], 'Checking if finished installing');
          cmd(results.host, 'cat /tmp/provision_complete', (err) => {
            current++;
            if (max === current) {
              return callback(new Error('max attempts to connect check for installed'));
            }
            if (err) {
              return setTimeout(() => {
                checkInstalled(callback);
              }, 5000);
            }
            callback();
          });
        };

        checkInstalled((err) => {
          if (err) {
            return done(err);
          }
          done(null);
        });
      }]

    }, (err, results) => {
      allDone(err, {
        host: results.host,
        instance: results.info
      });
    });
  }

  checkUntilRunning(instance, done) {
    log(['debug'], `Checking status of ${instance.InstanceId}`);
    this.getStatus(instance.InstanceId, (err, status) => {
      if (err) {
        return done(err);
      }
      if (status !== 'running') {
        setTimeout(() => {
          this.checkUntilRunning(instance, done);
        }, 5000);
        return;
      }
      done();
    });
  }

  getByName(name, done) {
    const params = {
      Filters: [
        { Name: 'tag:Name', Values: [name] },
        { Name: 'instance-state-name', Values: ['running'] }
      ]
    };
    this.ec2.describeInstances(params, (err, data) => {
      if (err) {
        return done(err);
      }
      if (data.Reservations.length === 1) {
        return done(null, data.Reservations[0].Instances[0]);
      }
      done(null, false);
    });
  }

  describeInstance(instanceId, done) {
    const options = {
      InstanceIds: [
        instanceId
      ]
    };
    this.ec2.describeInstances(options, done);
  }

  getStatus(instanceId, done) {
    const options = {
      InstanceIds: [instanceId]
    };
    this.ec2.describeInstanceStatus(options, (err, data) => {
      if (err) {
        return done(err);
      }

      if (data.InstanceStatuses.length === 0) {
        return done(null, 'invalid');
      }

      const status = data.InstanceStatuses[0].InstanceState.Name;
      done(err, status);
    });
  }

  terminate(instanceId, allDone) {
    async.auto({
      info: (done) => {
        log(['debug'], 'Getting instance info');
        this.describeInstance(instanceId, (err, results) => {
          if (err) {
            return done(err);
          }
          const reservation = results.Reservations[0];
          const instance = reservation.Instances[0];
          done(null, instance);
        });
      },

      ipAssociation: (done) => {
        log(['debug'], 'Getting elastic ip info');
        const params = {
          Filters: [{
            Name: 'instance-id',
            Values: [
              instanceId
            ]
          }]
        };
        this.ec2.describeAddresses(params, (err, data) => {
          if (err) {
            return done(err);
          }
          if (data.Addresses.length === 0) {
            return done();
          }
          const association = data.Addresses[0];
          done(null, association);
        });
      },

      disassociateAddress: ['ipAssociation', (results, done) => {
        if (!results.ipAssociation) {
          return done();
        }
        log(['debug'], 'Dissassociating IP Address');
        const params = {
          AssociationId: results.ipAssociation.AssociationId
        };
        this.ec2.disassociateAddress(params, done);
      }],

      releaseAddress: ['ipAssociation', 'disassociateAddress', (results, done) => {
        if (!results.ipAssociation) {
          return done();
        }
        log(['debug'], 'Releasing IP Address');
        const params = {
          AllocationId: results.ipAssociation.AllocationId
        };
        this.ec2.releaseAddress(params, done);
      }],

      terminate: ['disassociateAddress', (results, done) => {
        log(['debug'], 'Terminating Instance');
        const options = {
          InstanceIds: [instanceId]
        };
        this.ec2.terminateInstances(options, (err, data) => {
          if (err) {
            return done(err);
          }

          done(err, data);
        });
      }]
    }, (err, results) => {
      allDone(err, results);
    });
  }
}

module.exports = EC2;
