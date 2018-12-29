const fs = require('fs');
const { DateTime } = require('luxon');

const settings = require('./config');
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};
const current_log_level = settings.get('debug.log_level');

function isEqualOrHigherLevel(log_level) {
  let current = LOG_LEVELS[current_log_level];
  let checking = LOG_LEVELS[log_level];
  return current != undefined && checking != undefined && checking >= current;
}

function isLowerLevel(log_level) {
  return !isEqualOrHigherLevel(log_level);
}

let logger = function () {
  const LOG_FILE = 'log/protocol.log';

  this.writeToFile = function (text, file_name) {
    fs.writeFile(file_name, text, function(err) {
      if(err) {
        console.log(err);
      }
      else {
        console.log(`The file ${file_name} was saved!`);
      }
    });
  };

  this.appendToFile = function (text, file_name) {
    fs.appendFile(file_name, `${DateTime.local().toISO()}: ${text} \n`, function(err) {
      if(err) {
        console.log(err);
      }
      else {
        // console.log(`The file ${file_name} was saved!`);
      }
    });
  };

  this.log = function (text, log_level = 'info') {
    if (isLowerLevel(log_level))
      return;

    console.log(DateTime.local().toISO(), text);
    this.appendToFile(text, LOG_FILE);
  };

  this.fatal = function (text) {
    this.log(text, 'fatal');
  };

  this.error = function (text) {
    this.log(text, 'error');
  };

  this.warn = function (text) {
    this.log(text, 'warn');
  };

  this.info = function (text) {
    this.log(text, 'info');
  };

  this.debug = function (text) {
    this.log(text, 'debug');
  };

  this.currentLogLevel = function() {
    return current_log_level;
  };

  this.isEqualOrHigherLevel = isEqualOrHigherLevel;
  this.isLowerLevel = isLowerLevel;
};

module.exports = new logger();