#!/usr/bin/env node

// Exit on loss of parent process, if it had established an ipc control channel.
// We do this ASAP because we don't want child processes to leak, outliving
// their parent. If the parent has not established an 'ipc' channel to us, this
// will be a no-op, the disconnect event will never occur.
process.on('disconnect', function() {
  process.exit(2);
});

var assert = require('assert');
var config = require('../lib/config'); // May exit, depending on argv
var log = config.logger;

var agent = require('../lib/agent');
var agentOptions = {
  quiet: config.isWorker, // Quiet in worker, to avoid repeated log messages
  logger: config.logger,
};

var tracer = require('concurix');
var tracerOptions = {
  accountKey: agent().config.appName,
  archiveInterval: process.env.STRONG_CX_TRACER_ARCHIVE_INTERVAL || 60000,
  api_host: process.env.STRONG_CX_SERVER_API_HOST || 'localhost',
  api_port: process.env.STRONG_CX_SERVER_API_PORT || 8103
};

switch(config.profile) {
  case false: // Profiling explicitly disabled.
    if (config.isMaster) {
      log.error('supervisor running without profiling');
    }
    break;

  case undefined: // No explicit request for profiling or metrics.
    // Start with StrongOps if app is registered. This will print warning
    // messages to the console if the api key is not found, which is backwards
    // compatible.
    agent().profile(undefined, undefined, agentOptions);
    // Otherwise, just start. This is a no-op if it is already started.
    tracer(tracerOptions);
    agent().start();
    break;

  case true: // Profiling or metrics explicitly enabled.
    agent().configure(agentOptions);
    // Only try to start StrongOps if they have registered, to avoid legacy
    // warning messages. If an app is missing a name, profile may still fail
    // to start, so drop-through to start(). We must re-supply options.
    if (agent().config.key)
      agent().profile(undefined, undefined, agentOptions);
    // Otherwise, just start. This is a no-op if already started.
    tracer(tracerOptions);
    agent().start();
    break;

  default:
    assert(false, 'invalid profile value');
    break;
}

if ((config.clustered && config.isMaster) || config.detach) {
  return config.start();
}

// starts metrics reporting if --metrics was set, or does nothing
config.sendMetrics();
config.sendExpressRecords();
config.sendTraces();

if (!config.clustered) {
  console.log('supervisor running without clustering (unsupervised)');
}

// Reset argv to not include the runner (at argv[1]).
process.argv = process.argv.slice(0, 1).concat(process.argv.slice(2));

// Run as if app is the main module
require('module')._load(
  require('path').resolve(process.argv[1]),
  null, // parent
  true  // isMain
);
