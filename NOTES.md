# NOTES

Sqlite support (WIP)
  Fks seem to not be available. Provided in JDBC DatabaseMetaData?
  Use functions json_object(), json_group_array().

## Dev workflow

Build and run tests:

```sh
npm run build
npm run start-test-dbs
npm test
```

Tag a release:

```sh
git tag n<x>.<y>.<z>
# e.g. git tag n1.8.2
git push gh --tags
```

## Managing Dependency Versions

Show the latest dependency versions in `package.json`:

```sh
npx npm-check-updates
```

Add "-u" to write latest versions into `package.json`:
```sh
npx -u npm-check-updates
```

## TODO
- Make a new Deno branch based on main?
  See how much this simplifies usage.
  But dbmd generation would still probably best be done via a Maven project.
    But to get started users could just run the dbmd query manually.
