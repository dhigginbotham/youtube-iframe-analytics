exports.attr = function(elem) {
  if (typeof elem != 'undefined') {
    return function $attr(key, val) {
      if(typeof val == 'undefined') {
        return elem.getAttribute(key);
      } else if (val == 'rm') {
        return elem.removeAttribute(key);
      } else {
        return elem.setAttribute(key, val);
      }
    };
  } else {
    return null;
  }
}

exports.stringifySafe = function(str) {
  var output = null;
  try {
    output = JSON.parse(str);
  } catch (ex) {}
  return output;
};

var cl = function(debug) {
  if (!(this instanceof cl)) return new cl(debug);
  this.debug = debug;
  this.history = [];
  return this;
};

cl.prototype.log = function() {
  this.history.push(arguments);
  if (this.debug) {
    if(typeof window['console'] != 'undefined' && console.log) {
      var cp = Array.prototype.slice.call(arguments);
      if (cp.length === 1 && typeof cp[0] == 'object') cp = JSON.stringify(cp[0],null,2);
      console.log(cp);
    }
  }
  return this;
};

exports.cl = cl;