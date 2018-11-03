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
const LOG_FILE = 'files/protocol.log';
// TODO: how to avoid global var?
let global_history;
let global_day_history;
// TODO: create orders history file if not exists

// TODO: $ instead of cheerio
// log(test(5));

// TODO: разнести по файлам
// TODO: обработка разлогинивания раз в час ??
// TODO: фильтр по статусу заказа
function run() {
  let settings = readSettings();

  // TODO(khataev): kill task longer than threshold time
  if (settings) {
    logIn(settings, startUpdatesPolling)
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
    log(e);
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
    log('error:', error); // Print the error if one occurred
    log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // log('body:', body); // Print the HTML for the Google homepage.
    writeToFile(body, 'files/login.html');

    callback(settings);
  });
}

function getOrderUpdatesCallback(settings, orders, date) {
  log(`new orders for ${date.toFormat(DATE_FORMAT)} (${orders.length})`);
  // send to telega
  sendOrdersToTelegram(settings, orders, date);
  saveRawOrdersToHistory(global_history, orders, date);
}

async function startUpdatesPolling(settings) {
  let update_interval = settings.update_interval * 1000;
  let tomorrow = DateTime.local().plus({ days: 1 });
  while(true) {
    let dt_string = DateTime.local().toISO();
    log(`getting updates at ${dt_string}`);
    getOrdersUpdates(settings, getOrderUpdatesCallback);
    getOrdersUpdates(settings, getOrderUpdatesCallback, tomorrow);

    await Promise.all([sleep(update_interval)]);
  }
}

function formatDate(date) {
  return date.toFormat(DATE_FORMAT);
}

function filterOnlyOrders(i, elem) {
  return i > 0;
}

// TODO: вынести в настройки границы интервала
function filterByTime(i, elem) {
  try {
    let dt_string = cheerio(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);
    // TODO: move borders to settings
    return hour >= 7 && hour < 23;
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
  };
  request.get(data, function (error, response, body) {
    if (error) {
      log('error:', error); // Print the error if one occurred
      log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      return null;
    }

    let $ = cheerio.load(body);
    // selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';
    selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

    $orders_tbody = $(selector);
    $orders = $orders_tbody.children('tr');
    global_day_history = getOrdersHistory(date);
    $orders = $orders.filter(filterOrders);

    callback(settings, $orders, date);
  });
}

function getColumnText(row, colNum) {
  return row.children('td').eq(colNum).text()
}

function renderOrderData(order) {
  // 1, 3, 6, 7, 5, 2
  let orderNumber = getColumnText(order, 1),
    metro = getColumnText(order, 3),
    address = getColumnText(order, 6),
    client = getColumnText(order, 7),
    problem = getColumnText(order, 5),
    time = getColumnText(order, 2);

  return `м. ${metro}, ${address}; ${client}; ${problem}, ${time}, ${orderNumber}`
}

function seizeOrderUrl(orderNumber) {
  return (`http://ultima.uk.to/sched.php?id=${orderNumber}`);
}

function getReplyMarkup(orderNumber) {
  return reply_markup = {
    inline_keyboard: [
      [{ text: 'Забрать заказ', url: seizeOrderUrl(orderNumber)}]
    ]
  };
}

function log(text, write_to_console = true) {
  if (write_to_console)
    console.log(text);

  appendToFile(text, LOG_FILE);
}

function writeToFile(text, file_name) {
  fs.writeFile(file_name, text, function(err) {
    if(err) {
      console.log(err);
    }
    else {
      console.log(`The file ${file_name} was saved!`);
    }
  });
}

function appendToFile(text, file_name) {
  fs.appendFile(file_name, `${DateTime.local().toISO()}: ${text} \n`, function(err) {
    if(err) {
      console.log(err);
    }
    else {
      // console.log(`The file ${file_name} was saved!`);
    }
  });
}

function sendOrdersToTelegram(settings, orders, date = DateTime.local()) {
  orders.each(function(i, elem) {
    let orderNumber = getColumnText(cheerio(elem), 1);
    let replyMarkup = getReplyMarkup(orderNumber);
    sendToTelegram(settings, renderOrderData(cheerio(elem)), replyMarkup, date);
  });
}

function mapGetUpdatesElement(elem) {
  return elem['message']['chat']['id'];
}

function getBotSubscribers(settings) {
  let api_token = settings.credentials.telegram_bot.api_token;
  let url = `https://api.telegram.org/bot${api_token}/getUpdates`;

  let promise = new Promise(function(resolve, reject) {
    let params = { url: url };
    request.post(params, function (error, response, body) {
      if (error) {
        log('error:', error); // Print the error if one occurred
        log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        reject(error);
      }
      else {
        let body_json = JSON.parse(body);
        let result = body_json['result'];
        let subscribers = result == undefined ? [] : body_json['result'].map(mapGetUpdatesElement);
        let uniqueSubscribers = new Set(subscribers); // make them unique
        resolve(uniqueSubscribers);
      }
    });
  });

  return promise;
}

function sendToTelegram(settings, text, replyMarkup, date = DateTime.local()) {
  let settings_chat_id = settings.credentials.telegram_bot.chat_id;

  if (settings_chat_id) {
    console.log('sendToTelegram. Subscribers:', settings_chat_id);
    sendMessageToSubscriber(settings, settings_chat_id, text, replyMarkup, date);
  }
  else {
    getBotSubscribers(settings)
      .then(subscribers => {
        if (subscribers == undefined || subscribers.length == 0) {
          log('no subscribers, message would not be sent');
        }
        else {
          subscribers.forEach(function (chat_id) {
            console.log('sendToTelegram. Subscribers:', subscribers);
            sendMessageToSubscriber(settings, chat_id, text, replyMarkup, date);
          });
        }
      });
  }

  // let subscribers = [chat_id, 280609443, 253850760];
  //
  // subscribers.forEach(function(chat_id){
  //   sendMessageToSubscriber(settings, chat_id, text);
  //   // sendMessageToSubscriber(settings, 280609443, text);
  //   // sendMessageToSubscriber(settings, 253850760, text);
  // });
}

function sendMessageToSubscriber(settings, chat_id, text, reply_markup_object, date) {
  let api_token = isToday(date) ?
    settings.credentials.telegram_bot.today.api_token :
    settings.credentials.telegram_bot.tomorrow.api_token;

  settings.credentials.telegram_bot.api_token;

  let encoded_text = encodeURI(text);
  let encoded_reply_markup = encodeURI(JSON.stringify(reply_markup_object));
  let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}&reply_markup=${encoded_reply_markup}`;
  // let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
  log(`sendMessage url: ${url}`);
  log(`sendMessageToSubscriber. chat_id: ${chat_id}, text: ${text}`);
  // TODO parameters as hash
  request.post({
    url: url
  }, function(error, response, body) {
    if (error) {
      log('sendMessageToSubscriber. error:', error); // Print the error if one occurred
      log('sendMessageToSubscriber. statusCode:', response && response.statusCode); // Print the response status code if a response was received
    }
  });
}

function saveRawOrdersToHistory(history, orders, date = DateTime.local()) {
  let result = cheerio(orders).map(function(i, elem) {
    // log(cheerio(elem).children('td').eq(1).text());
    return cheerio(elem).children('td').eq(1).text();
  });
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
        log('writeHistory error');
        log(error);
      }
    })
  } catch (e) {
    log('writeHistory error');
    log(e);
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
    log('getOrdersHistory error');
    log(e);
  }
  return global_history[date.toFormat(ORDERS_HISTORY_DATE_FORMAT)] || [];
}

function isToday(date) {
  let today = DateTime.local();
  // TODO: why .startOf('day') does not work?

  return date &&
    today.year == date.year &&
    today.month == date.month &&
    today.day == date.day;
}

function test_run() {
  // let settings = readSettings();
  //
  // if (settings) {
  //   getBotSubscribers(settings).then(response => console.log('Subscribers: ', response));
  // }

  let dt = DateTime.fromFormat('2018-11-04', 'yyyy-LL-dd');
  console.log(isToday(dt));

}

run();
// history = getOrdersHistory();
// saveOrdersToHistory(history, [1,2]);

// test_run();