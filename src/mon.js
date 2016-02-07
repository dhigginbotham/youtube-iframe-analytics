var Mon = function(debug) {
  if (!(this instanceof Mon)) return new Mon(debug);
  this.debug = debug;
  this.history = [];
  return this;
};

Mon.prototype.log = function() {
  var cp = Array.prototype.slice.call(arguments);
  this.history.push(cp);
  if (this.debug) {
    if(typeof window['console'] != 'undefined' && console.log) {
      if (cp.length === 1 && typeof cp[0] == 'object') cp = JSON.stringify(cp[0],null,2);
      console.log(cp);
    }
  }
  return this;
};

module.exports = Mon;