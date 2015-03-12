var agent = require('./agent');
var cluster = require('cluster');
var debug = require('./debug')('trace-object');

module.exports = function sendTraceObject(parentCtl) {
  if (cluster.isWorker) {
    agent().on('trace:object', forwardTraceToMaster);
    return;
  }

  if (!parentCtl) {
    debug('parentCtl not available, all trace objects will be discarded.');
    return;
  }

  cluster.on('fork', function(worker) {
    worker.on('message', function forwardToParentIfTraceObject(msg) {
      if (msg.cmd !== 'trace:object') return;
      debug('master received', msg.record);
      parentCtl.notify(msg);
    });
  });
};

function forwardTraceToMaster(trace) {
  debug('received %j', record);
  process.send({
    cmd: 'trace:object',
    record: record
  });
}
