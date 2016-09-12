'use strict';

const AWS = require('aws-sdk');

class Route53 {
  constructor(config) {
    this.config = config;
    this.route53 = new AWS.Route53({
      region: this.config.server.region
    });
  }

  upsertAlias(domain, ip, done) {
    const params = {
      ChangeBatch: {
        Changes: [
          {
            Action: 'CREATE',
            ResourceRecordSet: {
              Name: domain,
              Type: 'A',
              ResourceRecords: [
                {
                  Value: ip
                }
              ]
            }
          }
        ]
      },
      HostedZoneId: 'Z2HO1HAKWMQHUR'
    };

    console.log(JSON.stringify(params, null, 2));

    this.route53.changeResourceRecordSets(params, done);
  }

  listResources(zoneId, done) {
    this.route53.listResourceRecordSets({
      HostedZoneId: zoneId
    }, done);
  }
}

module.exports = Route53;
