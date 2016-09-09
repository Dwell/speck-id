import defaults from 'lodash.defaults';
import rp from 'request-promise-any';
import intFormat from 'biguint-format';
import fs from 'fs';
import crypto from 'crypto';
import Promise from 'any-promise';

const HttpCoordinator = function(options, dateInstance = null) {
  this.lastHeartbeatTs = null;
  this.coordinatorId = this.generateNonce(8);
  this.coordination = null;
  this.options = Object.assign({}, options);
  defaults(this.options, {
    appId: null,
    privateKeyFile: null,
    heartbeatTtl: 300000, // 5min in ms
    coordinatorUrl: null,
    datacenterId: null,
    workerIdMask: null,
    machineIdMask: null,
  });
  if (!this.options.coordinatorUrl) {
    throw new Error('Missing `coordinatorUrl`');
  }
  if (!this.options.appId) {
    throw new Error('Missing `appId`');
  }
  if (!this.options.privateKeyFile) {
    throw new Error('Missing `privateKeyFile`');
  }
  this.privateKey = fs.readFileSync(this.options.privateKeyFile);

  this.dateInstance = dateInstance || Date;
  this.onChangeCallback = null;

  this.coordinate = (onChangeCallback, onErrorCallback = null, timeout = 15000) => {
    this.onChangeCallback = onChangeCallback;
    this.onErrorCallback = onErrorCallback;
    return this
      .tryHeartbeat()
      .timeout(timeout, 'HttpCoordinator timed out: ' + timeout + 'ms')
      .catch(err => {
        console.error(err);
        if (this.onErrorCallback) {
          this.onErrorCallback(err);
        }
      });
  };

  this.postToHttpCoordinator = () => {
    const nonce = this.generateNonce();
    let rpOptions = {
      method: 'POST',
      uri: this.options.coordinatorUrl,
      body: {
        coordinatorId: this.coordinatorId,
        options: {
          appId: this.options.appId,
          heartbeatTtl: this.options.heartbeatTtl,
        },
        request: {
          nonce: nonce,
          ts: this.dateInstance.now(),
        },
      },
      json: true,
    };
    if (this.options.datacenterId) {
      rpOptions.body.options.datacenterId = this.options.datacenterId;
    }
    if (this.options.workerIdMask) {
      rpOptions.body.options.workerIdMask = this.options.workerIdMask;
    }
    if (this.options.machineIdMask) {
      rpOptions.body.options.machineIdMask = this.options.machineIdMask;
    }
    if (this.coordination) {
      rpOptions.body.request.coordination = this.coordination;
    }
    rpOptions.body.signature = this.signRequest(rpOptions.body.request);

    return rp(rpOptions).then(parsedBody => {
      console.log('postToHttpCoordinator rp resolved!');
      console.log(parsedBody);
      return this.parseCoordinationResponse(parsedBody);
    });
  };

  this.tryHeartbeat = () => {
    if ((this.dateInstance.now() - this.lastHeartbeatTs) >= this.options.heartbeatTtl) {
      return this.runHeartbeat();
    }
    return Promise.resolve(true);
  };

  this.runHeartbeat = () => {
    // do this so we avoid multiple attempts
    this.lastHeartbeatTs = this.dateInstance.now();
    return this.postToHttpCoordinator().then(coordination => {
      console.log(coordination);
      this.coordination = coordination;
      // then set it here again for a true idea of when we should wait
      this.lastHeartbeatTs = this.dateInstance.now();
      process.nextTick(() => {
        this.onChangeCallback(null, this.coordination);
      });
      return true;
    })
  };
};

HttpCoordinator.prototype.parseCoordinationResponse = function (coordination) {
  // TODO - reserved in case we need to finagle with the response
  return coordination;
};

HttpCoordinator.prototype.signRequest = function (request) {
  const cryptoSign = crypto.createSign('sha256');
  cryptoSign.update(JSON.stringify(request));

  return cryptoSign.sign(this.privateKey).toString('hex');
};

/**
 * Generate a 128-bit nonce for the coordination request
 */
HttpCoordinator.prototype.generateNonce = function (sizeBytes = 16) {
  let buffer = new Buffer(sizeBytes);
  buffer.fill(0);
  for (let i = 0; i < sizeBytes; i++) {
    buffer.writeUInt8(Math.floor(Math.random() * 256), i);
  }

  return intFormat(buffer, 'hex');
};

export default HttpCoordinator;

export {
  HttpCoordinator
}
