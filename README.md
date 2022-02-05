# Proxy Authorization Service for Prefect UI and Prefect CLI

![Docker Cloud Automated build](https://img.shields.io/docker/cloud/automated/softrams/prefect-auth-proxy)

[Prefect](https://prefect.io) is a great platform for building data flows/pipelines. It supports hybrid execution with execution engines running on-premises with
all command control and monitoring capabilities via the Prefect UI hosted on the cloud. This means metadata about flows, logs and metrics
will be stored in the cloud and can be accessed via the UI. When possible, we do recommend using the Prefect Cloud to manage your data flows.

However some organizations may prefer or required to run their flows on-premises and have the UI run on-premises as well. This is where the
Proxy Authorization Service comes in. Prefect currently do not bundle Authentication/Authorization options for API in the open source eco-system.
This functionality is only available with Prefect Cloud, along with many other features.

If your deployments have any constraints or security regulations to use Prefect Cloud, this Proxy service could be used as a workaround for
Prefect UI and CLI to enable authentication/authorization for API. All the requests to Prefect API will be proxied through this service.

## Setup

This initial implementation uses API Key and MySQL/Postgres database backend to authenticate and authorize requests.

### Setup Database

This service looks for prefect_api_keys table in MYSQL/Postgres Database. Please refer to data/`<database>`/db_init.sql for the initial schema and sample data.

```sql
-- create table prefect_api_keys
CREATE TABLE `prefect_api_keys` (
  `user_id` varchar(128) NOT NULL,
  `scopes` varchar(2000) NOT NULL,
  `api_key` varchar(128) NOT NULL,
  `key_issu_dt` datetime NOT NULL,
  `key_expr_dt` datetime NOT NULL,
  `creatd_dt` datetime NOT NULL,
  `last_updatd_dt` datetime NOT NULL,
  `creatd_by` varchar(11) NOT NULL,
  `last_updatd_by` varchar(11) NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Sample Test Data
insert into prefect_api_keys (user_id, scopes, api_key, key_issu_dt, key_expr_dt, creatd_dt, last_updatd_dt, creatd_by, last_updatd_by)
values('USERID', 'mutation/*, query/*', 'TestKey001', '2021-12-27 00:00:00', '2022-12-31 00:00:00', '2021-12-30 00:00:00', '2021-12-30 00:00:00', 'ADMINUSERID', 'ADMINUSERID')
```

Pass database credentials as environment variables to the service. Please see section below for specific environment variables.

### Environment Variables

The following Environment Variables are available to configure the Proxy service:

| Option                        | Default             | Description                               |
| ----------------------------- | ------------------- | ----------------------------------------- |
| `ALLOW_PUBLIC_ACCESS`         | `false`             | Allow public access to the service        |
| `TENANT_ID`                   | `Default`           | Tenant ID                                 |
| `TENANT_NAME`                 | `Default`           | Tenant name                               |
| `TENANT_SLUG`                 | `default`           | Tenant slug                               |
| `LOG_LEVEL`                   | `warn`              | Default Log level (`error`,`warn`,`info`) |
| `API_SERVICE_URL`             | `<Prefect API URL>` | Prefect API Service URL                   |
| `HOST`                        | `0.0.0.0`           | Host                                      |
| `PORT`                        | `3000`              | Port                                      |
| `LOG_LEVEL_OVERRIDE_DURATION` | `300`               | Log level override duration (seconds)     |
| `ENV`                         | `NA`                | Environment Name                          |
| `DB_TYPE`                     | `postgres`          | Database Type [postgres/mysql]            |
| `DB_HOST`                     | `NULL`              | Database Server Host                      |
| `DB_USER`                     | `NULL`              | Database Server User                      |
| `DB_PASSWORD`                 | `NULL`              | Database Server Password                  |
| `DB_DATABASE`                 | `NULL`              | Database Name                             |

### Docker Image

#### Use pre-built docker image

Use docker image from Docker hub

```bash
# Run using pre-built docker image from docker hub
# Prepare environment variables in .env file
docker run -d -p 3000:3000 --env-file ./.env --name auth-proxy softrams/prefect-auth-proxy:latest
```

#### Build a local docker image

Build a local docker image (with any changes as needed) and publish to your own repository.

```bash
# Build local docker image
docker build -t prefect-auth-proxy .
# Run local docker image
# Prepare environment variables in .env file
docker run -d -p 3000:3000 --env-file ./.env --name auth-proxy prefect-auth-proxy
```

### Running the service

This is a typical node.js application. So you can simply clone this repo and run.

```bash
# Clone the repo
git clone https://github.com/softrams/prefect-auth-proxy.git prefect-auth-proxy

# install dependencies
cd prefect-auth-proxy
npm install

# Run the service
node index.js
```

#### Production Environments

Depending on the environment and how you are deploying Prefect, there are multiple ways to run the service.

- This is simply a Nodejs application. So you can also run it as a service using `pm2` or `nodemon` for production deployments.
- If you are running the service on a Kubernetes cluster, use the docker container and deploy as the ingress proxy service.

## Sample Initial Access Control Policy

Here is a sample initial access control policy for the Proxy service. You can use this policy to configure the access control policy for your Prefect UI and CLI.

### All Team Members

All team members will receive Read Only access to all aspects

```bash
query/*
```

### Model Operations, Development and QA Teams

Only select mutations are allowed for Model Operations Team and Development Team Members

```bash
# Run a workflow
mutation/create_flow_run

# Cancel a flow run
mutation/cancel_flow_run

# Restart a run
mutation/set_flow_run_states

```

### DevOps Team

For DevOps Team, all mutations are allowed.

```bash
mutation/*
```

## How to use

### Create API Keys and distribute to users/services

API key will be used to authenticate and authorize the requests. Create an API key by inserting an entry to the prefect_api_keys table. Please refer to data/db_init.sql for the initial schema and sample data.

### Using API Key via Browser

Run the following command from Browser Developer Tools console:

```bash
let auth = (document.getElementsByTagName('a')[0].__vue__.$store.state).user
auth.user.id='<api key>'
```

Once this is done, you can access the Prefect UI just like you would access the Prefect UI regularly.

> **Note:** Please note that, if you are NOT authorized to do certain things from UI, you will NOT see any error messages, but the request will silently fail.

### Using API Key with CLI

> **Note:** Using API Key with CLI is restricted to DevOps team and automated CI/CD pipelines currently, as it requires wildcard permissions to support all operations. All other teams can still use CLI to query the data, but will not be permitted to create/run workflows or administer Prefect environments. Use Prefect UI to review logs and restart workflows.

```bash
# Point to appropriate Prefect cloud server for the target environment
# These are the default values for Prefect in DEV environment
export PREFECT__CLOUD__ENDPOINT="<UI URL>"
export PREFECT__CLOUD__GRAPHQL="<API URL>/graphql"

# Set server to cloud
prefect backend cloud

# Authenticate with API Key
prefect auth login -k <api key>

# Alternately you can also set API Key to use by
# configuring this info in your .prefect.yml as follows
[API_HOST]
api_key = "<api key>"
tenant_id = "<tenant id>"

# Now you are all set. Run any Prefect command from CLI

# List projects on the cloud server
prefect get projects

```

## Enable Verbose Logging

### Set Log Level permanently

To enable verbose logging, set the `LOG_LEVEL` to `info`.
This will log all requests and responses along with headers and other information.

### Set Log Level temporarily

It is possible to dynamically set log level to `info` for 5 minutes by invoking the `/logs` endpoint. This 5 minute duration can be overridden by setting the `LOG_LEVEL_OVERRIDE_DURATION` to a different value.

```bash
# sets log level to info for 5 minutes
curl --location --request POST 'http://localhost:3000/logs/info'
```

## Cache Management

For better performance, API Key lookups are cached for 30 minutes. Cache expiration is checked every 5 minutes
and any expired keys are removed from the cache.

For testing purposes, you may clear the
entire cache or delete a specific api key from cache.

> **Note:** When multiple instances of this proxy are run (behing a load balancer), the cache is only cleared
> from the instance that process the request. There is no guarantee that the cache will be cleared from all instances.
> You may try multiple requests to make sure the cache is cleared in all instances.

### Clear Cache

Clear cache removes all cached API Key lookups.

```bash
curl --location --request POST 'http://localhost:3000/cache/reset'
```

### Delete Specific API Key from Cache

Use this operation for testing any changes made to API Key by deleting
just a specific key from the cache.

```bash
curl --location --request DELETE 'http://localhost:3000/cache/<api key>'
```

### Audit Trail

Audit trail logs are enabled specifically for all allowed and blocked mutations. Search for `PREFECT_AUDIT_TRAIL` in the logs to see the audit trail logs.
Here is an example of the audit trail log:

```
PREFECT_AUDIT_TRAIL: BLOCKED Mutation create_flow_run for <user_id> {
  operationName: 'CreateFlowRun',
  variables: { id: '3e216621-8e22-4f7f-af69-284c644cba05' },
  query: 'mutation CreateFlowRun($context: JSON, $id: UUID!, $flowRunName: String, $parameters: JSON, $scheduledStartTime: DateTime, $runConfig: JSON, $labels: [String!]) {\n' +
    '  create_flow_run(\n' +
    '    input: {context: $context, flow_id: $id, flow_run_name: $flowRunName, parameters: $parameters, scheduled_start_time: $scheduledStartTime, run_config: $runConfig, labels: $labels}\n' +
    '  ) {\n' +
    '    id\n' +
    '    __typename\n' +
    '  }\n' +
    '}\n'
}
```

## Roadmap

This is the first version of the Prefect API Proxy. This version is ready for use with the required setup as explained above.
You may fork this repository and make your own changes to the code to expand to fit your usecases.
If its generic enough, please consider contributing to the project.

Here is a summary of the planned features:

| Feature                                 | Description                                                     |
| --------------------------------------- | --------------------------------------------------------------- |
| Options for other Databases             | Add additional options for Databases and make this configurable |
| Automated Tests                         | Add automated tests for the Proxy Service                       |
| Automated CI/CD pipelines               | Add automated CI/CD pipelines and publish Docker Image          |
| Documentation for different deployments | Add documentation for different deployments                     |

## Credits

Our teams found Prefect to be an amazing framework, developed by [Prefect Technologies Inc.](https://prefect.io) and is licensed under the Apache 2.0 License.
Thanks a lot for the great work!
