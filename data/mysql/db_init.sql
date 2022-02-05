-- Create New Table
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
