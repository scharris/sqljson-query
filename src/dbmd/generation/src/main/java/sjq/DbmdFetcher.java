package sjq;

import java.io.IOError;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Properties;
import java.util.regex.Pattern;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.statement.SqlStatements;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import sjq.models.StoredDatabaseMetadata;

public class DbmdFetcher
{
  private final ObjectMapper objectMapper;
  private final Path jdbcPropsFile;
  private final Jdbi jdbi;
  private final boolean useJdbcMetadata;
  private static final Logger log = LoggerFactory.getLogger(DbmdFetcher.class);

  public DbmdFetcher(Path jdbcPropsFile, boolean useJdbcMetadata)
  {
    this.objectMapper = new ObjectMapper();
    this.objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
    this.jdbcPropsFile = jdbcPropsFile;
    this.jdbi = createJdbi(jdbcPropsFile);
    this.useJdbcMetadata = useJdbcMetadata;
  }

  private static String usage()
  {
    return """
      Expected arguments: [options] <jdbc-props-file> <database-type> <output-file>
        jdbc-props-file: JDBC properties file, with properties jdbc.driverClassName, jdbc.url, jdbc.username, jdbc.password.
        database-type: database type, one of 'pg', 'mysql', 'hsql', 'ora'
        output-file: File to which to write query result json value.
        [Options]
           --use-jdbc-md: Use jdbc metadata even if predefined dbmd SQL is found for the database type.
           --include-regex <table/view-name regex>: Regular expression for names of tables/views to be included.
           --exclude-regex <table/view-name regex>: Regular expression for names of tables/views to be excluded.
           --include-regex-base64 <table/view-name regex>: Regular expression for names of tables/views to be included, base-64 encoded.
           --exclude-regex-base64 <table/view-name regex>: Regular expression for names of tables/views to be excluded, base-64 encoded.
      """;
  }

  public static void main(String[] args)
  {
    boolean helpRequested = args.length == 1 && (args[0].equals("-h") || args[0].equals("--help"));
    if ( helpRequested )
    {
      System.out.println(usage());
      return;
    }

    var remArgs = new ArrayList<>(Arrays.asList(args));

    String includeRegex =
      Args.pluckStringOption(remArgs, "--include-regex").orElseGet(() ->
        base64Decode(Args.pluckStringOption(remArgs, "--include-regex-base64").orElse("Lio=")) // .*
      ).trim();
    String excludeRegex =
      Args.pluckStringOption(remArgs, "--exclude-regex").orElseGet(() ->
        base64Decode(Args.pluckStringOption(remArgs, "--exclude-regex-base64").orElse("XiQ=")) // ^$
      ).trim();

    boolean useJdbcMetadata = remArgs.remove("--use-jdbc-md");

    if ( remArgs.size() != 3 )
    {
      log.error(usage());
      System.exit(1);
    }

    Path jdbcPropsFile = Paths.get(args[0]);
    String dbType = args[1];
    Path outputFile = Paths.get(args[2]);

    if ( !Files.isRegularFile(jdbcPropsFile) )
      throw new RuntimeException("File not found: " + jdbcPropsFile);

    var dbmdFetcher = new DbmdFetcher(jdbcPropsFile, useJdbcMetadata);

    dbmdFetcher.generateMetadata(dbType, includeRegex, excludeRegex, outputFile);
  }

  private void generateMetadata
    (
      String dbType,
      String includeRegex,
      String excludeRegex,
      Path outputFile
    )
  {
    log.info("Generating database metadata.");
    log.info("JDBC connection properties: " + jdbcPropsFile);
    log.info("Database type: " + dbType);
    log.info("Relations include pattern: '" + includeRegex + "'");
    log.info("Relations exclude pattern: '" + excludeRegex + "'");
    log.info("Output file: " + outputFile);

    try
    {
      @Nullable String sql = useJdbcMetadata ? null : getTextResourceIfPresent(dbType + "-dbmd.sql");

      log.info(sql == null ? "Retrieving metadata via JDBC Connection::getMetaData()."
        : "Querying for metadata via predefined SQL query."
      );

      // If there's dbmd sql defined for this database type then use that, else use jdbc metadata.
      StoredDatabaseMetadata storedDbmd = sql != null
        ? executeDbmdSql(sql, includeRegex, excludeRegex)
        : constructDbmdFromJdbcMetadata(includeRegex, excludeRegex);

      objectMapper.writeValue(outputFile.toFile(), storedDbmd);

      log.info("Success");
      System.exit(0); // Added to keep Maven from complaining about lingering threads.
    }
    catch(Throwable t)
    {
      log.error(t.getMessage());
      System.exit(1);
    }
  }

  private StoredDatabaseMetadata executeDbmdSql
    (
      String sql,
      String includeRegex,
      String excludeRegex
    )
  {
    String jsonStr = jdbi.withHandle(db ->
      db.createQuery(sql)
      .bind("relIncludePat", includeRegex)
      .bind("relExcludePat", excludeRegex)
      .mapTo(String.class)
      .one()
    );

    try
    {
      return objectMapper.readValue(jsonStr, StoredDatabaseMetadata.class);
    }
    catch (JsonProcessingException e) { throw new RuntimeException(e); }
  }

  private StoredDatabaseMetadata constructDbmdFromJdbcMetadata
    (
      String includeRegex,
      String excludeRegex
    )
  {
    return jdbi.withHandle(db ->
      new JdbcDbmdFetcher().fetchMetadata(
        db.getConnection(),
        null,
        true,
        true,
        Pattern.compile(includeRegex),
        Pattern.compile(excludeRegex)
      )
    );
  }

  public Jdbi createJdbi(Path propsFile)
  {
    try
    {
      Properties props = new Properties();
      props.load(Files.newInputStream(propsFile));
      if ( !props.containsKey("jdbc.driverClassName") ||
           !props.containsKey("jdbc.url") ||
           !props.containsKey("jdbc.username") ||
           !props.containsKey("jdbc.password") )
        throw new RuntimeException(
          "Expected connection properties " +
          "{ jdbc.driverClassName, jdbc.url, jdbc.username, jdbc.password } " +
          "in connection properties file."
        );

      Class.forName(props.getProperty("jdbc.driverClassName"));

      Jdbi jdbi = Jdbi.create(
        props.getProperty("jdbc.url"),
        props.getProperty("jdbc.username"),
        props.getProperty("jdbc.password")
      );

      jdbi.getConfig(SqlStatements.class).setUnusedBindingAllowed(true);

      return jdbi;
    }
    catch(Exception e)
    {
      throw new RuntimeException(e);
    }
  }

  public @Nullable InputStream getResourceInputStreamIfPresent(String resourcePath)
  {
    return DbmdFetcher.class.getClassLoader().getResourceAsStream(resourcePath);
  }

  public @Nullable String getTextResourceIfPresent(String resourcePath)
  {
    try
    {
      InputStream is = getResourceInputStreamIfPresent(resourcePath);
      return (is == null) ? null : new String(is.readAllBytes(), StandardCharsets.UTF_8);
    }
    catch(IOException e)
    {
      throw new IOError(e);
    }
  }

  private static String base64Decode(String encodedString)
  {
    byte[] decodedBytes = Base64.getDecoder().decode(encodedString);
    return new String(decodedBytes);
  }
}
