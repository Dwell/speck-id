import Promise from 'any-promise';

const StaticCoordinator = function(coordination) {
  this.onChangeCallback = null;
  this.coordination = coordination;
  this.coordinate = onChangeCallback => {
    this.onChangeCallback = onChangeCallback;
    this.onChangeCallback(null, coordination);
    return Promise.resolve();
  };
};

export default StaticCoordinator;

export {
  StaticCoordinator
}
