CREATE TABLE prefect_api_keys (
    user_id varchar(128),
    scopes varchar(2000),
    api_key varchar(128),
    key_issu_dt timestamp,
    key_expr_dt timestamp,
    created_dt timestamp,
    last_updatd_dt timestamp,
    creatd_by TEXT,
    last_updatd_by TEXT
);

COPY prefect_api_keys
FROM '/docker-entrypoint-initdb.d/prefect-api-keys-table.csv'
DELIMITER ','
CSV HEADER;