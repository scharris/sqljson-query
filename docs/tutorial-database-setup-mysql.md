# MySQL Tutorial Database Setup

Here we'll setup a small MySQL database for our tutorial. We use Docker here to easily get the database up and
running with our test data, but those with MySQL experience should be easily able to adapt these instructions
to run on their own MySQL instance without relying on Docker.

Fetch the SQL scripts which create the database tables and load them with our tutorial example data:
```shell
# (in query-gen folder if following main tutorial)
mkdir db
curl https://raw.githubusercontent.com/scharris/sqljson-query/main/src/__tests__/db/mysql/sql/create-schema-objects.sql > db/create-schema-objects.sql
curl https://raw.githubusercontent.com/scharris/sqljson-query/main/src/__tests__/db/mysql/sql/create-test-data.sql > db/create-test-data.sql
```

Next create file `db/Dockerfile` with these contents:
```dockerfile
# db/Dockerfile
FROM mysql:8

COPY create-schema-objects.sql /docker-entrypoint-initdb.d/01-schema-objects.sql
COPY create-test-data.sql /docker-entrypoint-initdb.d/02-test-data.sql
RUN chmod a+r /docker-entrypoint-initdb.d/*

ENV MYSQL_ROOT_PASSWORD=drugs
ENV MYSQL_DATABASE=drugs
ENV MYSQL_USER=drugs
ENV MYSQL_PASSWORD=drugs
```
Now we can build the drugs-mysql image and start a container from the image:
```shell
docker build -t drugs-mysql db
docker run -d --name drugs-mysql -p 127.0.0.1:3306:3306 drugs-mysql
```

If all goes well with the above, we should be able to start a `mysql` client within the running container:

```shell
docker exec -it drugs-mysql mysql --user=drugs --password=drugs drugs
# select * from drug;
#  -- (should see 5 rows in result set)
# \q
```

To complete the database setup, create properties file `db/conn.props` to hold our connection information:

```console
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=drugs
MYSQL_PASSWORD=drugs
MYSQL_DATABASE=drugs
```

That's it! You're now ready to continue with the tutorial.