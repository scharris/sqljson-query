package org.sqljson;

import java.io.IOError;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;
import java.util.Base64;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.statement.SqlStatements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DbmdFetcher
{
  private static String usage()
  {
    return
      "Expected arguments: [options] <jdbc-props-file> <database-type> <output-file>\n" +
      "  jdbc-props-file: JDBC properties file, with properties jdbc.driverClassName, jdbc.url, " +
      "jdbc.username, jdbc.password.\n" +
      "  database-type: database type, one of 'pg', 'mysql', 'h2', 'ora'\n" +
      "  output-file: File to which to write query result json value.\n" +
      "  [Options]\n" +
      "     --include-regex <table/view-name regex>: Regular expression for names of tables/views to be included.\n" +
      "     --exclude-regex <table/view-name regex>: Regular expression for names of tables/views to be excluded.\n" +
      "     --include-regex-base64 <table/view-name regex>: Regular expression for names of tables/views to be included, base-64 encoded.\n" +
      "     --exclude-regex-base64 <table/view-name regex>: Regular expression for names of tables/views to be excluded, base-64 encoded.\n";
  }

  public static Jdbi createJdbi(Path propsFile)
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

  public static InputStream getResourceInputStream(String resourcePath)
  {
    InputStream is = DbmdFetcher.class.getClassLoader().getResourceAsStream(resourcePath);
    if ( is == null )
      throw new RuntimeException("Resource not found: " + resourcePath);
    return is;
  }

  public static String readResourceUtf8(String resourcePath)
  {
    try
    {
      InputStream is = getResourceInputStream(resourcePath);
      return new String(is.readAllBytes(), StandardCharsets.UTF_8);
    }
    catch(IOException e)
    {
      throw new IOError(e);
    }
  }

  public static void main(String[] args)
  {
    Logger log = LoggerFactory.getLogger(DbmdFetcher.class);

    boolean helpRequested = args.length == 1 && (args[0].equals("-h") || args[0].equals("--help"));
    if ( helpRequested )
    {
      System.out.println(usage());
      return;
    }

    List<String> remArgs = new ArrayList<>(Arrays.asList(args));

    String includeRegex =
      Args.pluckStringOption(remArgs, "--include-regex").orElseGet(() ->
        base64Decode(Args.pluckStringOption(remArgs, "--include-regex-base64").orElse("Lio=")) // .*
      );
    String excludeRegex =
      Args.pluckStringOption(remArgs, "--exclude-regex").orElseGet(() ->
        base64Decode(Args.pluckStringOption(remArgs, "--exclude-regex-base64").orElse("XiQ=")) // ^$
      );

    if ( remArgs.size() != 3 )
    {
      log.error(usage());
      System.exit(1);
    }

    Path jdbcPropsFile = Paths.get(args[0]);
    String dbType = args[1];
    Path outputFile = Paths.get(args[2]);

    log.info("Generating database metadata.");
    log.info("JDBC connection properties: " + jdbcPropsFile);
    log.info("Database type: " + dbType);
    log.info("Relations include pattern: " + includeRegex);
    log.info("Relations exclude pattern: " + excludeRegex);
    log.info("Output file: " + outputFile);

    if ( !Files.isRegularFile(jdbcPropsFile) )
      throw new RuntimeException("File not found: " + jdbcPropsFile);

    try
    {
      Jdbi jdbi = createJdbi(jdbcPropsFile);
      String sql = readResourceUtf8(dbType + "-dbmd.sql");

      String resultJson = jdbi.withHandle(db ->
        db.createQuery(sql)
        .bind("relIncludePat", includeRegex)
        .bind("relExcludePat", excludeRegex)
        .mapTo(String.class)
        .one()
      );

      Files.writeString(outputFile, resultJson);

      log.info("Success");
      System.exit(0); // Added to keep Maven from complaining about lingering threads.
    }
    catch(Throwable t)
    {
      log.error(t.getMessage());
      System.exit(1);
    }
  }

  private static String base64Decode(String encodedString)
  {
    byte[] decodedBytes = Base64.getDecoder().decode(encodedString);
    return new String(decodedBytes);
  }
}
