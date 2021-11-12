// version: 0.1.1+202111112345

"use strict";

var constants = {
  'default_base': 10,
  'default_interval': 5,
  'min_tstep': 1.0e0,
  'max_tstep': 60.0,
};
var options = {
  'separator': ":",
  'zone': null,
};

function assert (cond, msg) {
  if (!cond) {
    soft_error(msg);
  }
}

function soft_error (msg) {
  console.log(msg);
}

function fatal_error (msg) {
  stop_loop();
  alert(msg);
  throw msg;
}

function parse_int_option (arg, fallback = null) {
  if (!arg)
    return fallback;
  var m = arg.match(/([^_]+)(_([^_]+))?/);
  var arg = m[1];
  if (!arg)
    return fallback;
  var base = m[3];
  if (base === undefined)
    base = 10;
  else
    base = parseInt(base);
  return parseInt(arg, base);
}

function parse_timezone (arg) {
  var m = arg.match(/^(?:[uU][tT][cC]|[gG][mM][tT])?([+-])?((?::[0-9]*)*)$/);
  if (m) {
    var [arg, sign, magn] = m;
    //segs = [seg[max(i,0):i+2] for seg in mag.split(':') for i in xrange(-(len(seg)&1),len(seg) or 1,2)]
    return magn.split(":").reduce((a,v,i)=>a*60+parseInt(v));
  } else {
    //soft_error
    return 0;
  }
}

var default_alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ=+";
var base12_alphabet = "0123456789"+["↊↋","ᘔᖶ","&#"][1];

function in_base (t, base, precision) {
  var alphabet = base == 12? base12_alphabet : default_alphabet;
  var s = ".";
  for (var i = 0; i < precision; i++) {
    t *= base;
    var digit = Math.floor(t);
    t %= 1.0;
    if (i&1) {
      s += options.separator;
    }
    s += alphabet[digit];
  }
  return s;
}

function make_clock (base, precision, interval) {
  var base = parse_int_option(base, constants.default_base);
  var precision = parse_int_option(precision, constants.default_precision);
  var interval = parse_int_option(interval, precision);

  if (base > default_alphabet.length)
    fatal_error(`ERROR: base ${base} larger than default alphabet size (${default_alphabet.length})`);

  interval = 86400 * Math.pow(base, -interval);
  return [base, interval, precision];
}

function ut2tod (unix_time, zone) {
  // unix time --> local time (fraction) of day
  if (zone === null) {
    var ts = new Date(unix_time);
    var [hour, min, sec] = [ts.getHours(), ts.getMinutes(), ts.getSeconds()];
  } else {
    var ts = new Date(unix_time + zone);
    var [hour, min, sec] = [ts.getUTCHours(), ts.getUTCMinutes(), ts.getUTCSeconds()];
  }
  var time_of_day = ((hour * 60 + min) * 60 + sec + unix_time%1)/86400;
  assert(0 <= time_of_day && time_of_day <= 1, `0 <= time_of_day && time_of_day <= 1 (${[unix_time, zone, ts, hour, min, sec, time_of_day]})`);
  return time_of_day;
}

function clock_string (tod, clockdef) {
  var [base, interval, precision] = clockdef;
  var result = in_base(tod, base, precision);
  if (options.show_prefix) {
    result = base.toString()+": "+result;
  }
  return result;
}

function all_clock_strings (tod) {
  return options.clockdefs.map(clockdef => clock_string(tod, clockdef)).join("\n");
}

function parse_args (__, options) {
  var q = new URLSearchParams(location.search);
  //function get (key, fallback = null) {
  //  var v = q.get(key);
  //  return v === null? fallback : v;
  //}
  options.clockdefs = [];
  for (var [k,v] of q) {
    switch (k) {
    case "show_prefix":
      switch (v) {
      case "0":
        options.show_prefix = false;
        break;
      case "1":
        options.show_prefix = true;
        break;
      }
      break;
    case "sep":
      options.separator = v;
      break;
    case "zone":
      switch (v) {
      case "local":
        options.zone = null;
        break;
      case "utc":
      case "gmt":
      case "universal":
        options.zone = 0;
        break;
      default:
        options.zone = parse_timezone(v);
        break;
      }
      break;
    case "clocks":
      for (var clock of v.split(";")) {
        //var [base, precision, interval] = clock.split(",");
        var m = clock.match(/^([0-9a-zA-Z=+]+(?:_[0-9a-zA-Z=+]+)?)(?:,([0-9a-zA-Z=+]+)(?:,([0-9a-zA-Z=+]+))?)?$/);
        //console.log(clock, m);
        if (m === null) {
          soft_error(`Bad clockdef ${clock}`);
          break;
        }
        var [clock, base, precision, interval] = m;
        options.clockdefs.push(make_clock(base, precision, interval));
      }
      break;
    default:
      break;
    }
  }
  if (options.clockdefs.length == 0) {
    options.clockdefs.push(make_clock("10", "5"));
  }
  if (options.show_prefix === undefined) {
    options.show_prefix = (options.clockdefs.length > 1);
  }
}

var upcoming_ticks = [];
var loop_state = null;
function loop () {
  var unix_time = Date.now();//TODO

  var s = all_clock_strings(ut2tod(unix_time, options.zone));
  //for (var clockdef of clockdefs) {
  //
  //}
  ui_display.innerText = s;

  if (!loop_state) {
    loop_state = null;
    return;
  }

  for (var i = 0; i < upcoming_ticks.length; i++) {
    upt = upcoming_ticks[i] || unix_time;
    tstep = options.clockdefs[i][1];
    upcoming_ticks[i] = upt + Math.floor((unix_time - upt)/tstep + 1)*tstep;
  }
  var sleeptime = Math.max(Math.min(...upcoming_ticks.map(upt=>upt-unix_time), constants.max_tstep), constants.min_tstep);
  setTimeout(loop, sleeptime);
}
function stop_loop () {
  loop_state = false;
}
function start_loop () {
  if (loop_state === null) {
    loop_state = true;
    loop();
  } else {
    loop_state = true;
  }
}

function main () {
  parse_args(null, options);

  start_loop();
}

