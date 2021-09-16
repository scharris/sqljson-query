# Postgres/Docker Tutorial Database Setup

Here we'll setup a small Postgres database for our tutorial, using Docker to easily get the database up and
running with our test data. For performing the database setup without relying on Docker, please see the main
[database setup](tutorial-database-setup.md) instructions.

Fetch the SQL scripts which create the database tables and load them with our tutorial example data:
```shell
mkdir db
curl https://raw.githubusercontent.com/scharris/sqljson-query/main/src/__tests__/db/pg/sql/create-schema-objects.sql > db/create-schema-objects.sql
curl https://raw.githubusercontent.com/scharris/sqljson-query/main/src/__tests__/db/pg/sql/create-test-data.sql > db/create-test-data.sql
```

Next create file `db/Dockerfile` with these contents:
```dockerfile
# db/Dockerfile
FROM postgres:13

COPY create-schema-objects.sql /docker-entrypoint-initdb.d/01-schema-objects.sql
COPY create-test-data.sql /docker-entrypoint-initdb.d/02-test-data.sql
RUN chmod a+r /docker-entrypoint-initdb.d/*

ENV POSTGRES_USER=drugs
ENV POSTGRES_PASSWORD=drugs
ENV POSTGRES_DB=drugs
```
Now we can build the drugs-pg image and start a container from the image:
```shell
docker build -t drugs-pg db
docker run -d --name drugs-pg --rm -p 127.0.0.1:5432:5432 --shm-size=256MB drugs-pg
```

If all goes well with the above, we should be able to start a `psql` client within the running container:

```shell
docker exec -it drugs-pg psql -U drugs
# select * from drug;
#  -- (should see 5 rows in result set)
# \q
```

To complete the database setup, create properties file `db/jdbc.props` to hold our connection information:
```shell
# db/jdbc.props
jdbc.driverClassName=org.postgresql.Driver
jdbc.url=jdbc:postgresql://localhost:5432/drugs
jdbc.username=drugs
jdbc.password=drugs
```

That's it! You're now ready to continue with the tutorial.
