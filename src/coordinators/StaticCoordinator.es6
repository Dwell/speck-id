const StaticCoordinator = function(coordination) {
  this.onChangeCallback = null;
  this.coordination = coordination;
  this.coordinate = onChangeCallback => {
    this.onChangeCallback = onChangeCallback;
    this.onChangeCallback(null, coordination);
  };
};

export default StaticCoordinator;

export {
  StaticCoordinator
}
