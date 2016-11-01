/* eslint-disable no-console */
'use strict';

const AWS = require('aws-sdk');
const async = require('async');
const url = require('url');
const _ = require('lodash');
const Logr = require('logr');
const log = new Logr({ type: 'cli' });

class Route53 {
  constructor(config) {
    this.config = config;
    this.route53 = new AWS.Route53({
      region: this.config.server.region
    });
  }

  run(ipAddress, action, allDone) {
    async.auto({
      getZoneId: (done) => {
        const urlParts = url.parse(`http://${this.config.host}/`);
        if (!urlParts.hostname) {
          return done('URL Parse failed. Malformed URL in config.host');
        }

        const tld = urlParts.hostname.split('.').slice(-2).join('.');

        this.listZones((err, data) => {
          if (err) {
            return done(err);
          }
          const zone = _.find(data.HostedZones, (obj) => obj.Name === `${tld}.`);

          if (!zone) {
            return done(`Zone ${urlParts.hostname} not found on this account`);
          }

          done(null, zone);
        });
      },
      createRecord: ['getZoneId', (results, done) => {
        if (action !== 'create') {
          return done(null);
        }
        log(['debug'], `Adding DNS Records for ${this.config.host}`);
        this.updateAlias(results.getZoneId.Id, this.config.host, ipAddress, 'UPSERT', done);
      }],
      removeRecord: ['getZoneId', (results, done) => {
        if (action !== 'remove') {
          return done(null);
        }
        log(['debug'], `Removing DNS Records for ${this.config.host}`);
        this.updateAlias(results.getZoneId.Id, this.config.host, ipAddress, 'DELETE', done);
      }]
    }, allDone);
  }

  updateAlias(zoneId, domain, ip, action, done) {
    const params = {
      HostedZoneId: zoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: action,
            ResourceRecordSet: {
              Name: domain,
              Type: 'A',
              TTL: 86400,
              ResourceRecords: [
                {
                  Value: ip
                }
              ]
            }
          },
          {
            Action: action,
            ResourceRecordSet: {
              Name: `*.${domain}`,
              Type: 'CNAME',
              TTL: 86400,
              ResourceRecords: [
                {
                  Value: domain
                }
              ]
            }
          }
        ]
      }
    };

    this.route53.changeResourceRecordSets(params, done);
  }

  listResources(zoneId, done) {
    this.route53.listResourceRecordSets({
      HostedZoneId: zoneId
    }, done);
  }

  listZones(done) {
    this.route53.listHostedZones({}, done);
  }
}

module.exports = Route53;
