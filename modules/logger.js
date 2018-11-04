const fs = require('fs');
const { DateTime } = require('luxon');

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

  this.log = function (text, write_to_console = true) {
    if (write_to_console)
      console.log(text);

    this.appendToFile(text, LOG_FILE);
  };
};

module.exports = new logger();