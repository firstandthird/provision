/* eslint-disable no-console */
'use strict';

const AWS = require('aws-sdk');
const async = require('async');
const url = require('url');
const _ = require('lodash');

class Route53 {
  constructor(config) {
    this.config = config;
    this.route53 = new AWS.Route53({
      region: this.config.server.region
    });
  }

  run(ipAddress, allDone) {
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
        this.upsertAlias(results.getZoneId.Id, this.config.host, ipAddress, done);
      }]
    }, allDone);
  }

  upsertAlias(zoneId, domain, ip, done) {
    const params = {
      HostedZoneId: zoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
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
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: `*.${domain}`,
              Type: 'A',
              TTL: 86400,
              ResourceRecords: [
                {
                  Value: ip
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
