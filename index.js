const yaml = require('js-yaml');
const requestGlobal = require('request');
let request = requestGlobal.defaults({jar: true});
const fs = require('fs');
const { DateTime } = require('luxon');
const cheerio = require('cheerio');
// const test = require('./file');
const DATE_FORMAT = 'dd-LL-yyyy';
const ORDERS_HISTORY_PATH = 'orders_history.yml';
const ORDERS_HISTORY_DATE_FORMAT = 'dd-LL-yyyy';
const FILE_ENCODING = 'utf-8';
const LOG_FILE = 'files/protocol.log'
// TODO: how to avoid global var?
let global_history;
let global_day_history;
// TODO: create orders history file if not exists

// TODO: $ intead of cheerio
// console.log(test(5));

// TODO: разнести по файлам
// TODO: обработка разлогинивания раз в час
// TODO: конпка (url) забрать заказ
// TODO: фильтр по статусу заказа
function run() {
  let settings = readSettings();

  // TODO(khataev): kill task longer than threshold time
  if (settings) {
    logIn(settings, getUpdates)
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readSettings() {
  let settings;
  try {
    settings = yaml.safeLoad(fs.readFileSync('settings.yml', FILE_ENCODING));
  } catch (e) {
    console.log(e);
  }

  return settings;
}

function logIn(settings, callback) {
  form = {
    login: settings.credentials.personal_cabinet.login,
    pass: settings.credentials.personal_cabinet.password
    // password: settings.credentials.personal_cabinet.password
  };

  data = {
    url: settings.credentials.personal_cabinet.login_url,
    followAllRedirects: true,
    // jar: true,
    form: form
  };

  request.post(data, function (error, response, body) {
    console.log('error:', error); // Print the error if one occurred
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // console.log('body:', body); // Print the HTML for the Google homepage.
    writeToFile(body, 'files/login.html');

    callback(settings);
  });
}

function getOrderUpdatesCallback(settings, orders, date) {
  console.log(`new orders for ${date.toFormat(DATE_FORMAT)}: ${orders.length}`);
  // send to telega
  sendOrdersToTelegram(settings, orders);
  saveRawOrdersToHistory(global_history, orders, date);
}

async function getUpdates(settings) {
  update_interval = settings.update_interval * 1000;
  tomorrow = DateTime.local().plus({ days: 1 });
  while(true) {
    dt_string = DateTime.local().toISO();
    console.log(`getting updates at ${dt_string}`);
    getOrdersUpdates(settings, getOrderUpdatesCallback);
    getOrdersUpdates(settings, getOrderUpdatesCallback, tomorrow);

    await Promise.all([sleep(update_interval)]);
  }
}

function formatDate(date) {
  return date.toFormat(DATE_FORMAT);
}

function filterOnlyOrders(i, elem) {
  // console.log(`filterOnlyOrders: ${cheerio(elem).children('td').eq(1).text()}; result: ${i > 0}`);
  // return cheerio(elem).children('td').eq(1).attr('class') !== 'th';
  return i > 0;
}

// TODO: вынести в настройки границы интервала
function filterByTime(i, elem) {
  try {
    let dt_string = cheerio(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);

    return hour > 7 && hour < 23;
  } catch (e) {
    return true;
  }
}

function filterByStatus(i, elem) {
  // TODO
  return true;
}

function filterByHistory(i, elem) {
  let order_number = cheerio(elem).children('td').eq(1).text();
  // console.log(`filterByHistory: ${order_number}`);
  return !global_day_history.includes(order_number);
}

function filterOrders(i, elem) {
  return filterOnlyOrders(i, elem) &&
    filterByTime(i, elem) &&
    filterByStatus(i, elem) &&
    filterByHistory(i, elem);
}

function getOrdersUpdates(settings, callback, date = DateTime.local()) {
  data = {
    url: settings.orders_page,
    qs: { 'date': formatDate(date) }
  }
  request.get(data, function (error, response, body) {
    // console.log('body:', body); // Print the HTML for the Google homepage.
    // writeToFile(body, 'files/sched.html');

    if (error) {
      console.log('error:', error); // Print the error if one occurred
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      return null;
    }

    let $ = cheerio.load(body);
    // selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';
    selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

    $orders_tbody = $(selector);
    $orders = $orders_tbody.children('tr');
    global_day_history = getOrdersHistory(date);
    $orders = $orders.filter(filterOrders)
    // $orders.filter(filterOrders).each(function(i, elem){
    //   // console.log($(elem).text());
    //   // sendToTelegram(settings, renderOrderData($(elem)));
    // });


    // writeToFile($orders.html(), 'files/result.html');

    callback(settings, $orders, date);
  });
}

function renderOrderData(order) {
  function getColumnText(row, colNum) {
    return row.children('td').eq(colNum).text()
  }

  // 1, 3, 6, 7, 5, 2
  let orderNumber = getColumnText(order, 1),
    metro = getColumnText(order, 3),
    address = getColumnText(order, 6),
    client = getColumnText(order, 7),
    problem = getColumnText(order, 5),
    time = getColumnText(order, 2);

  return `${orderNumber} ${metro} ${address} ${client} ${problem} ${time}`
}

function log(text, console = true) {
  if (console)
    console.log(text);

  writeToFile(text, LOG_FILE);
}

function writeToFile(text, file_name) {
  fs.writeFile(file_name, text, function(err) {
    if(err) {
      return console.log(err);
    }
    console.log(`The file ${file_name} was saved!`);
  });
}

function sendOrdersToTelegram(settings, orders) {
  orders.each(function(i, elem) {
    sendToTelegram(settings, renderOrderData(cheerio(elem)));
  });
}

function mapGetUpdatesElement(elem) {
  conole.log(elem);
  return elem['message']['chat']['id'];
}

function getBotSubscribers(settings) {
  let api_token = settings.credentials.telegram_bot.api_token;
  let url = `https://api.telegram.org/bot${api_token}/getUpdates`;

  request.post({
    url: url
  }, function(error, response, body) {
    if (error) {
      console.log('error:', error); // Print the error if one occurred
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      return [];
    }
    else {
      let body_json = JSON.parse(body);
      let subscribers = body_json['result'].map(mapGetUpdatesElement);
      console.log(subscribers);
      return new Set(subscribers); // make them unique
    }
  });
}

// TODO: определение chat_id по имени канала
function sendToTelegram(settings, text) {
  let chat_id   = settings.credentials.telegram_bot.chat_id;

  // let subscribers = getBotSubscribers(settings);
  let subscribers = [chat_id, 280609443, 253850760];

  subscribers.forEach(function(chat_id){
    sendMessageToSubscriber(settings, chat_id, text);
    // sendMessageToSubscriber(settings, 280609443, text);
    // sendMessageToSubscriber(settings, 253850760, text);
  });
}

function sendMessageToSubscriber(settings, chat_id, text) {
  let api_token = settings.credentials.telegram_bot.api_token;

  let encoded_text = encodeURI(text);
  let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
  console.log(`sendMessageToSubscriber. chat_id: ${chat_id}, text: ${text}`);
  request.post({
    url: url
  }, function(error, response, body) {
    if (error) {
      console.log('sendMessageToSubscriber. error:', error); // Print the error if one occurred
      console.log('sendMessageToSubscriber. statusCode:', response && response.statusCode); // Print the response status code if a response was received
    }
  });
}

function saveRawOrdersToHistory(history, orders, date = DateTime.local()) {
  // console.log(`saveRawOrdersToHistory: ${orders.text()}`);
  let result = cheerio(orders).map(function(i, elem) {
    // console.log(cheerio(elem).children('td').eq(1).text());
    return cheerio(elem).children('td').eq(1).text();
  });

  // console.log('saveRawOrdersToHistory result1');
  // console.log(Array.from(result));
  // console.log('saveRawOrdersToHistory result2');
  // return Array.from(result);
  saveOrdersToHistory(history, Array.from(result), date);
}

function saveOrdersToHistory(history, orders, date = DateTime.local()) {
  key = date.toFormat(ORDERS_HISTORY_DATE_FORMAT);
  if (!history[key]) {
    history[key] = orders
  }
  else {
    history[key] = Array.from(new Set(history[key].concat(orders)));
  }
  history = deleteOldHistory(history);
  writeHistory(history);
}

function writeHistory(history) {
  try {
    yaml_contents = yaml.safeDump(history);
    fs.writeFileSync(ORDERS_HISTORY_PATH, yaml_contents, function(error) {
      if (error)  {
        console.log('writeHistory error');
        console.log(error);
      }
    })
  } catch (e) {
    console.log('writeHistory error');
    console.log(e);
  }
}

function deleteOldHistory(history, cutoff_date = DateTime.local()) {
  result = {};
  for (pair of Object.entries(history)) {
    cutoff_date_start = cutoff_date.startOf('day');
    dt = DateTime.fromFormat(pair[0], ORDERS_HISTORY_DATE_FORMAT).startOf('day');
    if (dt >= cutoff_date_start)
    {
      result[pair[0]] = pair[1];
    }
  }
  return result;
}

function getOrdersHistory(date = DateTime.local()) {
  try {
    if (!global_history)
      global_history = yaml.safeLoad(fs.readFileSync(ORDERS_HISTORY_PATH, FILE_ENCODING)) || {};
  } catch (e) {
    console.log('getOrdersHistory error');
    console.log(e);
  }
// console.log((history || {})[date.toFormat(ORDERS_HISTORY_DATE_FORMAT)] || []);
  return global_history[date.toFormat(ORDERS_HISTORY_DATE_FORMAT)] || [];
}

function test_run() {
  let settings = readSettings();

  if (settings) {

    getBotSubscribers(settings);
  }
}

run();
// history = getOrdersHistory();
// saveOrdersToHistory(history, [1,2]);

// test_run();