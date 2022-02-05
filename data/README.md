# Running Database in a local container

## Postgres

```bash
docker pull postgres

docker run --name proxydb \
--mount type=bind,source=$(pwd)/data/postgres,target=/docker-entrypoint-initdb.d \
-p 5432:5432 \
-e POSTGRES_PASSWORD=`<PASSWORD>` \
-d postgres

```

## MySQL

```bash
docker pull mysql

docker run --name proxydb \
--mount type=bind,source=$(pwd)/data/postgres,target=/docker-entrypoint-initdb.d \
-p 3306:3306 \
-e MYSQL_ROOT_PASSWORD=`<PASSWORD>` \
-d mysql

```
