const express = require("express");
const bodyParser = require("body-parser");
const { createProxyMiddleware } = require("http-proxy-middleware");

const mysql = require("mysql");
const Pool = require("pg-pool");
const fs = require("fs");

// Create Express Server
const app = express();

const NodeCache = require("node-cache");
const { init } = require("express/lib/application");

// #region Initialization
const tokenCache = new NodeCache({
  stdTTL: 1800, // 30 minutes
  checkperiod: 300, // 5 minutes
  maxKeys: 100,
  deleteOnExpire: true,
});

const config = {
  ALLOW_PUBLIC_ACCESS: process.env.ALLOW_PUBLIC_ACCESS || false,
  TENANT_ID: process.env.TENANT_ID || "Default",
  TENANT_NAME: process.env.TENANT_NAME || "Default",
  TENANT_SLUG: process.env.TENANT_SLUG || "default",
  LOG_LEVEL: process.env.LOG_LEVEL || "warn",
  API_SERVICE_URL:
    process.env.API_SERVICE_URL || "http://localhost:8080/graphql",
  HOST: process.env.HOST || "0.0.0.0",
  PORT: process.env.PORT || 3000,
  LOG_LEVEL_OVERRIDE_DURATION: process.env.LOG_LEVEL_OVERRIDE_DURATION || 300,
  ENV: process.env.ENV || "NA",
};

if (fs.existsSync("./config/permitted-routes.json")) {
  config.PERMITTED_ROUTES = JSON.parse(fs.readFileSync("./config/permitted-routes.json"));
}

// #endregion

// #region LOGGING
// Setup Log Levels
const gLogFunc = console.log;
const gWarnFunc = console.warn;

function initLogLevels(level) {
  console.debug = () => {};
  console.trace = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.log = () => {};

  if (level === "warn") {
    console.log = () => {};
    console.warn = gWarnFunc;
  }
  if (level === "error") {
    console.log = () => {};
    console.warn = () => {};
  }
  if (level === "info") {
    console.log = gLogFunc;
    console.warn = gWarnFunc;
  }
  gLogFunc("Log Level set to ", level);
}

initLogLevels(config.LOG_LEVEL);
gLogFunc("Service running with configuration:", config);

// #endregion

// #region Public Endpoints
// Public Endpoints
app.get("/healthcheck", (req, res, next) => {
  res.send("All OK");
});

// Allow enabling verbose logging for debugging
app.post("/logs/:level", (req, res, next) => {
  initLogLevels(req.params.level);
  setTimeout(() => {
    initLogLevels(config.LOG_LEVEL);
  }, config.LOG_LEVEL_OVERRIDE_DURATION * 1000);
  res.send(`Log Level Changed to ${req.params.level}`);
});

// Allow cache reset for testing
app.post("/cache/reset", (req, res, next) => {
  tokenCache.flushAll();
  res.send(`Cache Reset`);
});

app.delete("/cache/:key", (req, res, next) => {
  tokenCache.del(req.params.key);
  res.send(`Cache has been deleted for key: ${req.params.key}`);
});

// #endregion

// #region Utilities

let dbConn;

async function initDBConnection() {
  return new Promise(async (resolve, reject) => {
    try {
      if (process.env.DB_TYPE === "mysql") {
        dbConn = mysql.createPool({
          connectionLimit: 5,
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
        });
      } else {
        dbConn = new Pool({
          user: process.env.DB_USER,
          host: process.env.DB_HOST,
          database: process.env.DB_DATABASE,
          password: process.env.DB_PASSWORD,
          port: 5432,
        });
      }
      resolve(true);
    } catch (err) {
      console.log("Failure in creating DB connection pool:", err);
      reject(err);
    }
  });
}

async function dbQuery(query, params) {
  return new Promise(async (resolve, reject) => {
    try {
      dbConn.query(query, params, (error, results) => {
        if (error) {
          reject(error);
        } else {
          // console.log('dbQuery Results:', results);
          resolve(results.rows ? results.rows : results);
        }
      });
    } catch (err) {
      console.log("Failure in query: ", err);
      reject(err);
    }
  });
}

async function fetchAPIKeysInfo(key) {
  return new Promise(async (resolve, reject) => {
    try {
      let query = "";
      let params;
      if (process.env.DB_TYPE === "mysql") {
        params = [key];
        query =
          "select * from prefect_api_keys where api_key=? and CURDATE() < key_expr_dt";
      } else {
        params = [key];
        query =
          "select * from prefect_api_keys where api_key=$1 and CURRENT_TIMESTAMP < key_expr_dt";
      }

      dbConn.query(query, params, (error, results) => {
        if (error) {
          reject(error);
        } else {
          // console.log('dbQuery Results:', results);
          resolve(results.rows ? results.rows : results);
        }
      });
    } catch (err) {
      console.log("Failure in query: ", err);
      reject(err);
    }
  });
}

const checkRoutes = (url, routes) => {
  if (!routes || !routes.length) {
    return false;
  }

  regexRoutes = routes.map(route => route.replace(/\*/g, "[^ ]*"));

  for (let i = 0; i < regexRoutes.length; i++) {
    const match = url.match(regexRoutes[i]);

    if (match) {
      return true;
    }
  }

  return false;
};

const allowPassthrough = (url, method, acl) => {
  // check config for public access
  if (config.ALLOW_PUBLIC_ACCESS) {
    return true;
  }

  // check permitted routes
  if (config.PERMITTED_ROUTES && config.PERMITTED_ROUTES[method]?.length && checkRoutes(url, config.PERMITTED_ROUTES[method])) {
    return true;
  }

  // check acl
  if (checkRoutes(url, acl?.ops)) {
    return true;
  }

  return false;
};
// #endregion

// #region Middleware
// Body Parser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Auth Middleware
app.use(async (req, res, next) => {
  let apiKey = null;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    apiKey = authHeader.split(" ")[1];
  } else {
    apiKey = req.get("x-prefect-user-id");
  }

  if (apiKey) {
    req.apikey = apiKey;
    let acl = tokenCache.get(apiKey);
    if (!acl) {
      // Fetch ACL from database and store in cache
      const aclDB = await fetchAPIKeysInfo(apiKey);
      if (aclDB && aclDB.length > 0) {
        acl = aclDB[0];
        acl.ops = acl.scopes.split(",").map((el) => el.trim());
        console.log("ACL: ", acl);
        tokenCache.set(apiKey, acl);
      } else {
        acl = {
          user_id: "Anonymous",
          ops: [],
        };
      }
    }
    console.log("ACL: ", acl);
    req.acl = acl;
  }

  if (!allowPassthrough(req.url, req.method, req.acl)) {
    return res.status(401).send("Unauthorized");
  } else {
    next();
  }
});

// #endregion

// #region Proxy Setup
app.use(
  "/",
  createProxyMiddleware({
    target: config.API_SERVICE_URL,
    changeOrigin: true,
    logLevel: "error",
    // pathRewrite: {
    //   [`^/graphql`]: "/graphql",
    // },
    onProxyRes: (proxyRes, req, res) => {
      console.log("Response from API: ", proxyRes.statusCode);
      console.log("Response Headers", proxyRes.headers);
      var body = [];
      proxyRes.on("data", function (chunk) {
        body.push(chunk);
      });
      proxyRes.on("end", function () {
        body = Buffer.concat(body).toString();
        console.log("res from proxied server:", body);
        // res.end("my response to cli");
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log("URL", req.url);
      console.log("Headers:", req.headers);
      console.log("Body:", req.body);
      if (!req.body || !Object.keys(req.body).length) {
        return res.status(400).send("Invalid Request");
      }

      if (
        req.url === "/" &&
        req.body &&
        req.body.query &&
        req.body.query.includes("auth_info")
      ) {
        res.json({
          data: {
            auth_info: { tenant_id: config.TENANT_ID },
          },
        });
      } else if (
        req.url === "/" &&
        req.body &&
        req.body.query &&
        req.body.query.includes("tenant(where")
      ) {
        res.json({
          data: {
            tenant: [
              {
                name: config.TENANT_NAME,
                slug: config.TENANT_SLUG,
                id: config.TENANT_ID,
              },
            ],
          },
        });
      } else {
        // Proxy request to end point
        const writeBody = (bodyData) => {
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        };

        if (req.body) {
          writeBody(JSON.stringify(req.body));
        }
      }
    },
  })
);

// #endregion

// Start the Proxy
app.listen(config.PORT, config.HOST, async () => {
  gLogFunc(`Starting Proxy at ${config.HOST}:${config.PORT}`);
  if (!dbConn) {
    await initDBConnection();
  }
});
