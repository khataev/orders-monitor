const convict = require('convict');

// Define a schema
const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  db: {
    username: {
      doc: "username",
      format: String,
      default: "",
      env: "DB_USERNAME"
    },
    password: {
      doc: "password",
      format: String,
      default: "",
      env: "DB_PASSWORD"
    },
    database: {
      doc: "database",
      format: String,
      default: "",
      env: "DB_DATABASE"
    },
    host: {
      doc: "host",
      format: String,
      default: "127.0.0.1",
      env: "DB_HOST"
    },
    dialect: {
      doc: "dialect",
      format: String,
      default: "postgres",
      env: "DB_DIALECT"
    }
  },
  orders: {
    url: {
      doc: "Page with orders",
      format: "url",
      default: "http://example.com",
      env: "ORDERS_URL",
    },
    update_interval: {
      doc: "Orders update interval (in seconds)",
      format: "int",
      default: 30,
      env: "ORDERS_UPDATE_INTERVAL"
    },
    filter_hours: {
      from: {
        doc: "Operating hours. FROM (included)",
        format: "int",
        default: 0,
        env: "ORDERS_FILTER_HOURS_FROM"
      },
      to: {
        doc: "Operating hours. TO (included)",
        format: "int",
        default: 24,
        env: "ORDERS_FILTER_HOURS_TO"
      }
    }
  },
  credentials: {
    personal_cabinet: {
      login_url: {
        doc: "Page with orders",
        format: "url",
        default: "http://example.com",
        env: "CREDENTIALS_PERSONAL_CABINET_LOGIN_URL",
      },
      login: {
        doc: "Login",
        format: String,
        default: '',
        env: "CREDENTIALS_PERSONAL_CABINET_LOGIN"
      },
      password: {
        doc: "Password",
        format: String,
        default: '',
        env: "CREDENTIALS_PERSONAL_CABINET_PASSWORD"
      },
    },
    telegram_bot: {
      delay_between_requests: {
        doc: "Delay between consequent API calls (ms)",
        format: "int",
        default: "1",
        env: "CREDENTIALS_TELEGRAM_BOT_DELAY"
      },
      today: {
        api_token: {
          doc: "Bot api token for today notifications",
          format: String,
          default: "",
          env: "CREDENTIALS_TELEGRAM_BOT_TODAY_API_KEY"
        }
      },
      tomorrow: {
        api_token: {
          doc: "Bot api token for tomorrow notifications",
          format: String,
          default: "",
          env: "CREDENTIALS_TELEGRAM_BOT_TOMORROW_API_KEY"
        }
      },
      chat_ids: {
        doc: "List of internal chat ids of bot recipients",
        format: Array,
        default: [],
        env: "CREDENTIALS_TELEGRAM_BOT_CHAT_IDS"
      }
    }
  }
});

// Load environment dependent configuration
let env = config.get('env');
config.loadFile('./config/' + env + '.json');

// Perform validation
config.validate({allowed: 'strict'});

module.exports = config;