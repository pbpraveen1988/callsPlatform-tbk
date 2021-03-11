const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const passport = require("passport");
const dotenv = require("dotenv");
const compression = require("compression");
const path = require('path');
const log4js = require("log4js");
const fs = require('fs');
const db_connect = require("./tools/db-connect");
const { startCallsCronJob } = require("./crons");
const { PUBLIC_FOLDER_NAME } = require("./global/constants");


const app = express();
const SERVER_PORT = process.env.PORT || 4000;

dotenv.config();


log4js.configure({
  appenders: {

    callback: {
      type: 'multiFile', base: 'logs/', property: 'campaignId', extension: '.log'
      // maxLogSize: 10485760, backups: 3, compress: true
    },
    express: {
      type: 'file', base: 'express/', filename: 'express/express.log',
      maxLogSize: 10485760, backups: 10000, compress: true
    }
  },
  categories: {
    default: { appenders: ['callback'], level: 'debug' },
    expressCat: { appenders: ['express'], level: 'debug' }
  }
});


db_connect
  .DBConnectMongoose()
  .then((dbInfo) => {

    try {
      db_connect.MYSQLDBConnect();
    } catch (ex) {
      console.error('mysql connection error');
    }

    const routes = require("./routes");
    // passport for jwt authentication
    app.use(passport.initialize());
    require("./passport")(passport);



    // setup the logger

    var logger = log4js.getLogger('expressCat');
    app.use(log4js.connectLogger(logger, {
      level: 'auto',
      format: (req, res, format) => format(`:method :url ${JSON.stringify(req.body)}`)
    }));


    // bodyParser, parses the request body to be a readable json format
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json({ limit: "50mb" }));
    // app.use(logger("dev"));




    app.use(compression());
    // app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(PUBLIC_FOLDER_NAME));

    const whitelist = ["*"];
    app.disable("x-powered-by");
    app.options(whitelist, cors());
    app.use(
      cors({
        credentials: true,
        origin(origin, callback) {
          callback(null, true);
        },
      })
    );

    app.get('/logs', function (req, res) {
      const file = `${__dirname}/express/express.log`;
      res.download(file); // Set disposition and send it.
    });


    
    app.get('/ccfuel-logs-download', function (req, res) {
      const file = `${__dirname}/public/debug.log`;
      res.download(file); // Set disposition and send it.
    });

    app.get('/download/log/:id', function (req, res) {
      const file = `${__dirname}/logs/${req.params.id}.log`;
      res.download(file); // Set disposition and send it.
    });


    routes.assignRoutes(app);
    app.listen(SERVER_PORT);
    console.log(`Server listening on port ` + SERVER_PORT);
    // startCallsCronJob();

  })
  .catch((err) => {
    console.log("Error: " + err);
  });
