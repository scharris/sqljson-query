FROM mysql:8.0.28-oracle

COPY sql/create-schema-objects.sql /docker-entrypoint-initdb.d/01-schema-objects.sql
COPY sql/create-test-data.sql /docker-entrypoint-initdb.d/02-test-data.sql
RUN chmod a+r /docker-entrypoint-initdb.d/*

ENV MYSQL_ROOT_PASSWORD=drugs
ENV MYSQL_DATABASE=drugs
ENV MYSQL_USER=drugs
ENV MYSQL_PASSWORD=drugs
