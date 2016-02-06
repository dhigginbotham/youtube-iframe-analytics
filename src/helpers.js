exports.attr = function attr(elem) {
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