'use strict';

const Route53 = require('./lib/route53');

console.log('Test');

const config = {
  server: {
    region: 'us-west-2'
  }
};


const router = new Route53(config);
/*
router.listResources('Z2HO1HAKWMQHUR', (err, data) => {
  if (err) {
    return console.log(err);
  }

  console.log(JSON.stringify(data, null, 2));
});
*/
router.upsertAlias('testsub.velvetcalifornia.com', '52.33.86.75', (err, data) => {
  console.log(JSON.stringify(err, null, 2));
  console.log(data);
});

