import defaults from 'lodash.defaults';
import mapValues from 'lodash.mapvalues';
import zip from 'lodash.zip';
import Promise from 'any-promise';
import deasync from 'deasync';
import intFormat from 'biguint-format';

const Speck = function (options) {
  const self = this;

  this.machineId = null;

  this.options = Object.assign({}, options);
  defaults(this.options, {
    date: Date,
    epoch: 0,
    fieldBits: {
      ph: 0, // placeholder
      ts: 42, // timestamp
      dc: 4, // datacenter
      w: 6, // worker
      s: 12, // sequence
    },
  });

  this.fieldBits = options.fieldBits;
  let totalBits = 0;
  for (let f in this.fieldBits) {
    if (this.fieldBits.hasOwnProperty(f)) {
      totalBits += this.fieldBits[f];
    }
  }
  let totalBytes = Math.ceil(totalBits / 8);
  if (totalBytes !== (totalBits >> 3)) {
    throw new Error('Sum of field bits must be whole bytes');
  }

  const CoordinatorInstance = this.options.coordinator || null;
  if (CoordinatorInstance && typeof CoordinatorInstance.coordinate !== 'function') {
    throw new Error('Coordinator must implement coordinate method')
  }

  const DateInstance = this.options.date;
  if (typeof DateInstance.now !== 'function') { // Mock Date.now when testing
    throw new Error('Date instance must implement now method');
  }

  this.fieldBits.m = this.fieldBits.dc + this.fieldBits.w;
  this.fieldBitMasks = mapValues(this.fieldBits, bits => Math.pow(2, bits) - 1);

  const itr = (() => {
    let sequence = 0;
    let overflow = false;
    let lastTime = DateInstance.now() - this.options.epoch;
    let waitDelayExponent = 0;

    return () => {
      waitDelayExponent = Math.min(waitDelayExponent, 10);
      let time = (DateInstance.now() - this.options.epoch);

      if (this.machineId === null) {
        return waitRetry(Math.pow(2, waitDelayExponent++));
      }
      if (time === lastTime) {
        if (overflow) {
          return waitRetry(Math.pow(2, waitDelayExponent++));
        }
        sequence = (sequence + 1) & this.fieldBitMasks.s;
        if (sequence === 0) {
          overflow = true;
          return waitRetry(Math.pow(2, waitDelayExponent++));
        }
      } else {
        overflow = false;
        sequence = 0;
      }
      lastTime = time;
      waitDelayExponent = 0;

      const id = this.buildId(time, sequence, totalBytes);

      if (
        CoordinatorInstance &&
        typeof CoordinatorInstance.tryHeartbeat === 'function' &&
        typeof CoordinatorInstance.shouldRunHeartbeat === 'function' &&
        CoordinatorInstance.shouldRunHeartbeat()
      ) {
        process.nextTick(() => {
          CoordinatorInstance.tryHeartbeat().catch(err => {
            console.error(err);
          });
        });
      }

      return id;
    }
  })();

  const waitRetry = (delay = 1) => {
    return Promise.delay(delay).then(() => {
      return itr();
    })
  };

  const SpeckIdYield = {
    next: () => { // async Promise ID generation
      return Promise.resolve(itr());
    },
    generate: (format = 'dec') => { // synchronous ID generation
      let id = itr();

      if (Promise.resolve(id) == id) { // it's a promise, deasync it
        id = (deasync((idPromise, done) => {
          return idPromise.then(_id => {
            done(null, _id);
          });
        }))(id);
      }

      if (format === 'raw') {
        return id;
      } else {
        return intFormat(id, format);
      }
    }
  };

  this.initCoordination(CoordinatorInstance);

  return SpeckIdYield;
};

Speck.prototype.buildId = function(time, sequence, totalBytes) {
  const ph = 0;
  const machineIdBits = this.fieldBits.dc + this.fieldBits.w;
  const id = new Buffer(8);
  id.fill(0);

  // we have 8 bytes here we need to fill
  let f1 = [
    this.fieldBits.s,
    machineIdBits,
    this.fieldBits.ts,
    this.fieldBits.ph,
  ];
  let f2 = [
    sequence,
    this.machineId,
    time,
    ph,
  ];
  let fields = zip(f1, f2);

  let bits, fieldValue, leftoverBits = 0, leftoverFieldValue = 0;
  let byteOffset = totalBytes - 1;

  fields.forEach(f => {
    let byteValue, bitsNeeded, bitsNeededMask;
    bits = f[0];
    fieldValue = f[1];
    while ((bits + leftoverBits) >= 8) {
      byteValue = 0;
      if (leftoverBits) {
        bitsNeeded = 8 - leftoverBits;
        bitsNeededMask = Math.pow(2, bitsNeeded) - 1;
        byteValue = ((fieldValue & bitsNeededMask) << leftoverBits) | leftoverFieldValue;
        fieldValue = Math.floor(fieldValue / (1 << bitsNeeded));
        bits -= bitsNeeded;
        leftoverFieldValue = 0;
        leftoverBits = 0;
        id.writeUInt8(byteValue, byteOffset--);
      } else {
        id.writeUInt8(fieldValue & 0xFF, byteOffset--);
        fieldValue = Math.floor(fieldValue / (1 << 8));
        bits -= 8;
      }
    }
    leftoverBits = bits;
    leftoverFieldValue = fieldValue;
  });

  return id;
};

Speck.prototype.initCoordination = function (CoordinatorInstance) {
  if (CoordinatorInstance) {
    return CoordinatorInstance.coordinate(this.coordinationUpdated.bind(this), this.coordinationFailed.bind(this), 5000);
  } else if (typeof this.options.machineId !== 'undefined') {
    this.machineId = (this.options.machineId & this.fieldBitMasks.m);
  } else if (typeof this.options.datacenterId !== 'undefined' || typeof this.options.workerId !== 'undefined') {
    var datacenterId = (typeof this.options.datacenterId !== 'undefined') ? (this.options.datacenterId & this.fieldBitMasks.dc) : 0;
    var workerId = (typeof this.options.workerId !== 'undefined') ? (this.options.workerId & this.fieldBitMasks.w) : 0;
    this.machineId = (datacenterId << this.fieldBits.w) | workerId;
  } else {
    this.machineId = 0;
  }
  return Promsie.resolve();
};

Speck.prototype.coordinationUpdated = function (err, coordination) {
  if (coordination.machineId) {
    this.machineId = coordination.machineId;
  } else if (typeof coordination.datacenterId !== 'undefined' && typeof coordination.workerId !== 'undefined') {
    let datacenter = coordination.datacenterId & this.fieldBitMasks.dc;
    let worker = coordination.workerId & this.fieldBitMasks.w;
    this.machineId = (datacenter << this.fieldBits.w) | worker;
  } else {
    this.machineId = coordination;
  }
};

Speck.prototype.coordinationFailed = function(err) {
  if (this.options.fallback && this.options.fallback.coordinator) {
    let CoordinatorInstance = this.options.fallback.coordinator;
    CoordinatorInstance.coordinate(this.coordinationUpdated.bind(this));
  }
};

export default Speck;

export {
  Speck
}
