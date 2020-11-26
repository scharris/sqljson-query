create table foo (
  id int generated always as identity primary key,
  name varchar(200),
  category varchar(1),
  description varchar(200)
);