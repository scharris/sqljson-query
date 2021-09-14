#!/bin/sh
DBDIR="$(cd "$(dirname "$0")"; pwd)";

docker build -t drugs-mysql $DBDIR

docker run -d --name drugs-mysql -p 127.0.0.1:3306:3306 drugs-mysql

# While container 'drugs-mysql' started as above is running, you can run a
# mysql client within the container via:
#    docker exec -it drugs-mysql mysql --user=drugs --password=drugs drugs
# This will allow you to enter database queries and commands.
# drugs=# select * from drug;
# Type ctrl-d or \q to exit mysql and return to your shell.

# To stop and remove the container:
# docker rm -vf drugs-mysql
