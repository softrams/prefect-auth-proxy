const express = require("express");
const bodyParser = require("body-parser");
const { createProxyMiddleware } = require("http-proxy-middleware");
const mysql = require("mysql");
const { parse } = require("graphql");

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
      dbConn = mysql.createPool({
        connectionLimit: 5,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
      });
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
          resolve(results);
        }
      });
    } catch (err) {
      console.log("Failure in query: ", err);
      reject(err);
    }
  });
}

const isMutationBlocked = (op, acl) => {
  // If public access is allowed, no need to check ACL
  if (config.ALLOW_PUBLIC_ACCESS) {
    return false;
  }

  if (op && op.query) {
    const parsedQuery = parse(op.query);
    const operationType = parsedQuery.definitions[0].operation;
    // Operation Names are symbolic and currently Prefect CLI does not
    // use them. So use the Selection Fields to determine the operation type
    // const operationName = parsedQuery.definitions[0].name
    //   ? parsedQuery.definitions[0].name.value
    //   : parsedQuery.definitions[0].selectionSet.selections[0].name.value;
    const operationName =
      parsedQuery.definitions[0].selectionSet.selections[0].name.value;

    if (
      acl.ops &&
      (acl.ops.includes(`${operationType}/*`) ||
        acl.ops.includes(`${operationType}/${operationName}`))
    ) {
      // Do not block
      console.log(`ALLOWED ${operationType} Op Name: `, operationName);
      if (operationType === "mutation") {
        console.warn(
          `PREFECT_AUDIT_TRAIL: ${operationType} ${operationName} allowed for ${acl.user_id}`,
          op
        );
      }
      return false;
    } else {
      // Block
      console.warn(
        `PREFECT_AUDIT_TRAIL: BLOCKED ${operationType} ${operationName} for ${acl.user_id}`,
        op
      );
      return true;
    }
  } else {
    return true;
  }
  return true;
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
      const aclDB = await dbQuery(
        "select * from prefect_api_keys where api_key=? and CURDATE() < key_expr_dt",
        [apiKey]
      );
      if (aclDB && aclDB.length > 0) {
        acl = aclDB[0];
        acl.ops = acl.scopes.split(",").map((el) => el.trim());
        console.log("ACL: ", acl);
        tokenCache.set(apiKey, acl);
      } else {
        acl = {
          user_id: "Anonymous",
          ops: ["mutation/none", "query/*"],
        };
      }
    }
    console.log("ACL: ", acl);
    req.acl = acl;
  }

  if (!req.acl && !config.ALLOW_PUBLIC_ACCESS) {
    res.status(401).send("Unauthorized");
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
        const contentType = proxyReq.getHeader("Content-Type");
        const writeBody = (bodyData) => {
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        };

        if (contentType.includes("application/json")) {
          let ops = req.body;
          let filteredOps = [];

          if (Array.isArray(ops)) {
            for (let op of ops) {
              if (isMutationBlocked(op, req.acl)) {
                // console.log("Mutation filtered");
              } else {
                filteredOps.push(op);
              }
            }
            if (filteredOps.length > 0) {
              writeBody(JSON.stringify(filteredOps));
            } else if (filteredOps.length === 1) {
              writeBody(JSON.stringify(filteredOps[0]));
            } else {
              return res.status(401).send("Unauthorized");
            }
          } else {
            let op = ops;
            if (isMutationBlocked(op, req.acl)) {
              // console.log("Mutation filtered");
              return res.status(401).send("Unauthorized");
            }
            writeBody(JSON.stringify(ops));
          }
        }

        if (contentType === "application/x-www-form-urlencoded") {
          writeBody(querystring.stringify(req.body));
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
