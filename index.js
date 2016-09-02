'use strict';
const yargs = require('yargs');
const yaml = require('js-yaml');
const fs = require('fs');
const confi = require('confi');
const async = require('async');
const readline = require('readline');
const Logr = require('logr');
const destroy = require('./lib/destroy');
const create = require('./lib/create');
const log = new Logr({
  type: 'cli'
});


async.auto({
  argv: (done) => {
    done(null, yargs.argv);
  },

  config: ['argv', (results, done) => {
    let baseConf = {};
    if (results.argv.config) {
      log(`Using config: ${results.argv.config}`);
      const confString = fs.readFileSync(results.argv.config, 'utf8');
      baseConf = yaml.safeLoad(confString);
    }

    const config = confi({
      path: `${__dirname}/conf`,
      context: baseConf
    });
    log(config.server);
    done(null, config);
  }],

  rl: (done) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    done(null, rl);
  },

  confirm: ['rl', 'argv', (results, done) => {
    const message = (results.argv.destroy) ? 'Remove instance? (y/n) ' : 'Create or Update instance? (y/n)';
    results.rl.question(message, (answer) => {
      results.rl.close();
      done(null, answer);
    });
  }],

  main: ['config', 'confirm', 'argv', (results, done) => {
    if (results.confirm !== 'y') {
      return done();
    }
    let fn = create;
    if (results.argv.destroy || results.argv.terminate) {
      log('Destroying instance');
      fn = destroy;
    }
    fn(results.config, done);
  }]
}, (err, results) => {
  if (err) {
    log(['error'], err);
    process.exit(1);
  }
  log(['success'], results.main);
  process.exit(0);
});
