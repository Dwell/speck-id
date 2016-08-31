const RandomCoordinator = function(machineBits = 12) {
  this.machineBitMask = Math.pow(2, machineBits) - 1;
  this.onChangeCallback = null;
  this.coordination = null;
  this.coordinate = onChangeCallback => {
    this.onChangeCallback = onChangeCallback;
    this.coordination = this.generateRandomCoordination();
    this.onChangeCallback(null, coordination);
  };
  this.generateRandomCoordination = () => {
    var randomMachineId = Math.floor(Math.random() * this.machineBitMask);

    return {machineId: randomMachineId};
  };
};

export default RandomCoordinator;

export {
  RandomCoordinator
}
