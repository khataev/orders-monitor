const requestGlobal = require('request');
const { DateTime } = require('luxon');
const express = require('express');

// local files
const constants = require('./modules/constants');
const logger = require('./modules/logger');
const settings = require('./modules/config');
const telegram = require('./modules/telegram');
const util = require('./modules/util');
const parser = require('./modules/parser');
const history = require('./modules/history');
const packageInfo = require('./package.json');

let request = requestGlobal.defaults({jar: true});
let telegramApi = new telegram(settings, logger);
let historyManager = new history(settings, logger);
let parserApi = new parser(historyManager, request, settings, logger);

function start_simple_server() {
  if (settings.get('env') == 'production') {
    const http = require('http')
    let port = process.env.PORT || 80;
    const server = http.createServer((request, response) => {
      console.log(request.url);
      response.end('Hello Node.js Server!');
    });

    server.listen(port, (err) => {
      if (err) {
        return console.log('something bad happened', err);
      }
      console.log(`server is listening on ${port}`);
    })
  }
}

function start_express_server() {
  if (settings.get('env') == 'production') {
    let app = express();

    app.get('/', function (req, res) {
      res.json({ version: packageInfo.version });
    });

    var server = app.listen(process.env.PORT, function () {
      let host = server.address().address;
      let port = server.address().port;

      logger.log('Web server started at http://%s:%s', host, port);
    });
  }
}

// TODO: обработка разлогинивания раз в час ??
function run() {
  if (settings) {
    start_express_server();

    historyManager
      .initOrdersHistory()
      .then(orders => { console.log('INIT ORDERS HISTORY COMPLETE'); })
      .then(result => {
        statuses = settings.get('orders.statuses');
        logger.log(statuses);
        logIn(settings, startUpdatesPolling);
      });
  }
}

function logIn(settings, callback) {
  form = {
    login: settings.get('credentials.personal_cabinet.login'),
    pass: settings.get('credentials.personal_cabinet.password')
  };

  data = {
    url: settings.get('credentials.personal_cabinet.login_url'),
    followAllRedirects: true,
    // jar: true,
    form: form
  };

  request.post(data, function (error, response, body) {
    if (error) {
      logger.log('error:', error); // Print the error if one occurred
      logger.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      // logger.log('body:', body); // Print the HTML for the Google homepage.
      // logger.writeToFile(body, 'log/login.html');
    }
    callback(settings);
  });
}

function positiveStatusCallback(order_row, date) {
  sendOrderToTelegram(order_row, date);
  historyManager.saveOrderToHistory(
    parserApi.getOrderNumber(order_row),
    date
  );
  historyManager.releaseProcessingOrder(
    parserApi.getOrderNumber(order_row)
  );
}

// TODO: add date hoisting instead of piping through all callback chain
function getOrderUpdatesCallback(attempt, settings, orders, date) {
  logger.log(`filtered orders attempt ${attempt} for ${date.toFormat(constants.DATE_FORMAT)} (${orders.length})`);
  parserApi.filterByStatus(orders, date, positiveStatusCallback);
  // send to telega
  // sendOrdersToTelegram(settings, orders, date);
  // historyManager.saveRawOrdersToHistory(orders, date);
}

async function startUpdatesPolling(settings) {
  let update_interval = settings.get('orders.update_interval') * 1000;
  let attempt = 0;
  while(true) {
    attempt = attempt + 1;
    let now = DateTime.local();
    let tomorrow = DateTime.local().plus({ days: 1 });
    let dt_string = now.toISO();
    logger.log(`GETTING UPDATES, attempt ${attempt} at: ${dt_string}`);
    // historyManager.printGlobalHistory();
    parserApi.getOrdersUpdates(attempt, getOrderUpdatesCallback, now);
    parserApi.getOrdersUpdates(attempt, getOrderUpdatesCallback, tomorrow);

    await util.sleep(update_interval);
  }
}

async function sendOrderToTelegram (order_row, date) {
  let orderNumber = parserApi.getOrderNumber(order_row);
  const replyMarkup = parserApi.getReplyMarkupBotApi(orderNumber);
  let text = parserApi.renderOrderData(order_row);

  await telegramApi.sendToTelegram(settings, text, replyMarkup, date);
}

// HINT: not used anymore
async function sendOrdersToTelegram(settings, orders, date = DateTime.local()) {
  await util.asyncForEach(orders, async function(i, elem) {
    sendOrderToTelegram(elem, date);
  });
}

function test_run() {
  if (settings) {

    logIn(settings, (settings) => {parserApi.getOrderStatus(47703698);});

    // const Sequelize = require('sequelize');
    // const database = require('./config/database');
    // sequelize = new Sequelize(database[settings.get('env')]);
    // Order = sequelize.import("./models/order");
    //
    // historyManager
    //   .initOrdersHistory()
    //   .then(orders => { console.log('INIT COMPLETE'); })
    //   .then(result => {
    //
    //
    //     result = historyManager.dayHistoryIncludes('47653830');
    //     console.log('result', result)
    //     console.log('exit');
    //   });

    // console.log(DateTime.local().toJSDate());
    key = DateTime.local().toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  }
}

run();
// test_run();