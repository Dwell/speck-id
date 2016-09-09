require('any-promise/register/bluebird');
var path = require('path');
var Speck = require('../index').Speck;
var HttpCoordinator = require('../index').HttpCoordinator;
var RandomCoordinator = require('../index').RandomCoordinator;

var randomCoordinator = new RandomCoordinator();
var speckOptions = {
  date: Date,
  fieldBits: {
    ph: 0, // placeholder
    ts: 42, // timestamp
    dc: 4, // datacenter
    w: 6, // worker
    s: 12, // sequence
  },
  fallback: {
    coordinator: randomCoordinator,
  },
};
var httpCoordinatorOptions = {
  appId: '6176610241392422912',
  privateKeyFile: path.resolve(__dirname, './config', './ec-privkey.pem'), // TODO
  heartbeatTtl: 60000,
  coordinatorUrl: 'https://ew5o47vk40.execute-api.us-west-2.amazonaws.com/dev/speck/coordinator',
  datacenterId: 15,
  workerIdMask: Math.pow(2, speckOptions.fieldBits.w) - 1,
  machineIdMask: Math.pow(2, speckOptions.fieldBits.dc + speckOptions.fieldBits.w) - 1,
};
speckOptions.coordinator = new HttpCoordinator(httpCoordinatorOptions);

var speckId = new Speck(speckOptions);

console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
console.log(speckId.generate());
