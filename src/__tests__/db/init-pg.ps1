$dbDir = "$PSScriptRoot"

docker build -t drugs-pg $dbDir

docker run -d --name drugs-pg --rm -p 5432:5432 --shm-size=256MB --env-file=$dbDir/db.env drugs-pg


# While container 'drugs-pg' started as above is running, you can run a
# psql client within the container via:
#    docker exec -it drugs-pg psql -U drugs
# This will allow you to enter database queries and commands.
# drugs=# select * from drug;
# Type ctrl-d or "exit" to exit psql and return to your shell.
#
# Or connect from the host
#  - with jdbc via url:
#    jdbc:postgresql://localhost:5432/drugs
#  - or with connection parameters:
#    host: localhost
#    port: 5432
#    user: drugs
#    database: drugs
#    (password is ignored)

# To stop and remove the container:
# docker rm -vf drugs-pg
