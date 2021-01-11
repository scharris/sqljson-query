FROM postgres:13

COPY create-schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY create-schema-objects.sql /docker-entrypoint-initdb.d/02-schema-objects.sql
COPY create-test-data.sql /docker-entrypoint-initdb.d/03-test-data.sql
RUN chmod a+r /docker-entrypoint-initdb.d/*

ENV POSTGRES_USER=drugs
ENV POSTGRES_PASSWORD=drugs
ENV POSTGRES_DB=drugs
