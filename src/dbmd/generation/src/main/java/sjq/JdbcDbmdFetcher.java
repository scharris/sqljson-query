package sjq;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Pattern;
import static java.util.Collections.emptyList;
import static java.util.Objects.requireNonNull;
import static java.util.function.Function.identity;
import static java.util.stream.Collectors.toMap;
import org.jetbrains.annotations.Nullable;
import sjq.models.CaseSensitivity;
import sjq.models.Field;
import sjq.models.ForeignKey;
import sjq.models.ForeignKeyComponent;
import sjq.models.RelId;
import sjq.models.RelMetadata;
import sjq.models.RelType;
import sjq.models.StoredDatabaseMetadata;

public class JdbcDbmdFetcher
{
  public enum DateMapping { DATES_AS_DRIVER_REPORTED, DATES_AS_TIMESTAMPS, DATES_AS_DATES }

  private final DateMapping dateMapping;

  public JdbcDbmdFetcher()
  {
    this(DateMapping.DATES_AS_DRIVER_REPORTED);
  }

  public JdbcDbmdFetcher(DateMapping mapping)
  {
    this.dateMapping = mapping;
  }

  public StoredDatabaseMetadata fetchMetadata
    (
      Connection conn,
      @Nullable String schema,
      boolean includeViews,
      boolean includeFks,
      @Nullable Pattern includeRelsPat,
      @Nullable Pattern excludeRelsPat
    )
  {
    try
    {
      DatabaseMetaData dbmd = conn.getMetaData();

      CaseSensitivity caseSens = getDatabaseCaseSensitivity(dbmd);

      @Nullable String nSchema = schema != null ? normalizeDatabaseIdentifier(schema, caseSens) : null;

      List<RelDescr> relDescrs = fetchRelationDescriptions(dbmd, nSchema, includeViews, includeRelsPat, excludeRelsPat);

      List<RelMetadata> relMds = fetchRelationMetadatas(relDescrs, nSchema, dbmd);

      List<RelId> tables = relDescrs.stream().filter(rd -> rd.relType() == RelType.table).map(RelDescr::relId).toList();

      List<ForeignKey> fks = includeFks ? fetchForeignKeys(dbmd, tables) : emptyList();

      String dbmsName = dbmd.getDatabaseProductName();
      String dbmsVer = dbmd.getDatabaseProductVersion();
      int majorVer = dbmd.getDatabaseMajorVersion();
      int minorVer = dbmd.getDatabaseMinorVersion();

      return new StoredDatabaseMetadata(dbmsName, dbmsVer, majorVer, minorVer, caseSens, relMds, fks);
    }
    catch(Exception e) { throw new RuntimeException(e); }
  }

  public List<RelDescr> fetchRelationDescriptions
    (
      DatabaseMetaData dbmd,
      @Nullable String schema,
      boolean includeViews,
      @Nullable Pattern includeRelsPattern,
      @Nullable Pattern excludeRelsPattern
    )
    throws SQLException
  {
    List<RelDescr> relDescrs = new ArrayList<>();

    String[] relTypes = includeViews ? new String[]{"TABLE","VIEW"}: new String[]{"TABLE"};

    ResultSet rs = dbmd.getTables(null, schema, null, relTypes);

    while (rs.next())
    {
      @Nullable String relSchema = rs.getString("TABLE_SCHEM");
      String relName = rs.getString("TABLE_NAME");

      RelId relId = new RelId(relSchema, relName);

      if (matches(includeRelsPattern, relId.getIdString(), true) &&
          !matches(excludeRelsPattern, relId.getIdString(), false))
      {
        RelType relType =
          rs.getString("TABLE_TYPE").equalsIgnoreCase("table") ? RelType.table
            : RelType.view;

        relDescrs.add(new RelDescr(relId, relType, rs.getString("REMARKS")));
      }
    }

    return relDescrs;
  }

  public List<RelMetadata> fetchRelationMetadatas
    (
      List<RelDescr> relDescrs,
      @Nullable String schema,
      DatabaseMetaData dbmd
    )
    throws SQLException
  {
    Map<RelId, RelDescr> relDescrsByRelId = relDescrs.stream().collect(toMap(RelDescr::relId, identity()));

    try (ResultSet colsRS = dbmd.getColumns(null, schema, "%", "%"))
    {
      List<RelMetadata> relMds = new ArrayList<>();
      RelMetadataBuilder rmdBldr = null;

      while (colsRS.next())
      {
        @Nullable String relSchema = colsRS.getString("TABLE_SCHEM");
        String relName = colsRS.getString("TABLE_NAME");

        RelId relId = new RelId(relSchema, relName);

        RelDescr relDescr = relDescrsByRelId.get(relId);
        if (relDescr != null) // Include this relation?
        {
          Field f = makeField(colsRS, dbmd);

          // Relation changed ?
          if (rmdBldr == null || !relId.equals(rmdBldr.relId))
          {
            // finalize previous if any
            if (rmdBldr != null)
              relMds.add(rmdBldr.build());

            rmdBldr = new RelMetadataBuilder(relId, relDescr.relType(), relDescr.comment());
          }

          rmdBldr.addField(f);
        }
      }

      if (rmdBldr != null)
        relMds.add(rmdBldr.build());

      return relMds;
    }
  }

  public List<ForeignKey> fetchForeignKeys
    (
      DatabaseMetaData dbmd,
      List<RelId> tableRelIds
    )
    throws SQLException
  {
    Set<RelId> tableSet = new HashSet<>(tableRelIds);

    List<ForeignKey> fks = new ArrayList<>();

    for (RelId relId : tableRelIds)
    {
      try (ResultSet rs = dbmd.getImportedKeys(null, relId.schema(), relId.name()))
      {
        FkBuilder fkBldr = null;

        while (rs.next())
        {
          short compNum = rs.getShort("KEY_SEQ");

          if (compNum == 1) // starting new fk
          {
            // Finalize previous fk if any.
            if (fkBldr != null && tableSet.contains(fkBldr.tgtRel))
              fks.add(fkBldr.build());

            fkBldr = new FkBuilder(
              new RelId(rs.getString("FKTABLE_SCHEM"), rs.getString("FKTABLE_NAME")),
              new RelId(rs.getString("PKTABLE_SCHEM"), rs.getString("PKTABLE_NAME")),
              rs.getString("FK_NAME")
            );

            fkBldr.addComponent(new ForeignKeyComponent(
              rs.getString("FKCOLUMN_NAME"),
              rs.getString("PKCOLUMN_NAME")
            ));
          }
          else // adding another fk component
          {
            requireNonNull(fkBldr); // because we should have seen a component # 1 before entering here
            fkBldr.addComponent(new ForeignKeyComponent(
              rs.getString("FKCOLUMN_NAME"),
              rs.getString("PKCOLUMN_NAME")
            ));
          }
        }

        if (fkBldr != null && tableSet.contains(fkBldr.tgtRel))
          fks.add(fkBldr.build());
      }
    }

    return fks;
  }

  public static CaseSensitivity getDatabaseCaseSensitivity(DatabaseMetaData dbmd)
    throws SQLException
  {
    if (dbmd.storesLowerCaseIdentifiers())
      return CaseSensitivity.INSENSITIVE_STORED_LOWER;
    else if (dbmd.storesUpperCaseIdentifiers())
      return CaseSensitivity.INSENSITIVE_STORED_UPPER;
    else if (dbmd.storesMixedCaseIdentifiers())
      return CaseSensitivity.INSENSITIVE_STORED_MIXED;
    else
      return CaseSensitivity.SENSITIVE;
  }

  public String normalizeDatabaseIdentifier(String id, CaseSensitivity caseSens)
  {
    if (id.startsWith("\"") && id.endsWith("\""))
      return id;
    else if (caseSens == CaseSensitivity.INSENSITIVE_STORED_LOWER)
      return id.toLowerCase();
    else if (caseSens == CaseSensitivity.INSENSITIVE_STORED_UPPER)
      return id.toUpperCase();
    else
      return id;
  }

  protected static @Nullable Integer getRSInt(ResultSet rs, String colName)
    throws SQLException
  {
    int i = rs.getInt(colName);
    return rs.wasNull() ? null : i;
  }

  protected Field makeField(ResultSet colsRS, DatabaseMetaData dbmd)
    throws SQLException
  {
    try (ResultSet pkRS = dbmd.getPrimaryKeys(colsRS.getString(1), colsRS.getString(2), colsRS.getString(3)))
    {
      // Fetch the primary key field names and part numbers for this relation
      Map<String, Integer> pkSeqNumsByName = new HashMap<>();
      while (pkRS.next())
        pkSeqNumsByName.put(pkRS.getString(4), pkRS.getInt(5));
      pkRS.close();

      String name = colsRS.getString("COLUMN_NAME");
      int typeCode = colsRS.getInt("DATA_TYPE");
      String dbType = colsRS.getString("TYPE_NAME");

      // Handle special cases/conversions for the type code.
      if (typeCode == Types.DATE || typeCode == Types.TIMESTAMP)
        typeCode = getTypeCodeForDateOrTimestampColumn(typeCode, dbType);
      else if ("XMLTYPE".equals(dbType) || "SYS.XMLTYPE".equals(dbType))
        // Oracle uses proprietary "OPAQUE" code of 2007 as of 11.2, should be Types.SQLXML = 2009.
        typeCode = Types.SQLXML;

      @Nullable Integer size = getRSInt(colsRS, "COLUMN_SIZE");
      @Nullable Integer length = isJdbcTypeChar(typeCode) ? size : null;
      @Nullable Integer nullableInt = getRSInt(colsRS, "NULLABLE");
      @Nullable Boolean nullable =
        Objects.equals(nullableInt, ResultSetMetaData.columnNullable) ? Boolean.TRUE :
        Objects.equals(nullableInt, ResultSetMetaData.columnNoNulls) ? Boolean.FALSE:
        null;
      @Nullable Integer fracDigs = isJdbcTypeNumeric(typeCode) ? getRSInt(colsRS, "DECIMAL_DIGITS") : null;
      @Nullable Integer prec = isJdbcTypeNumeric(typeCode) ? size : null;
      @Nullable Integer rad = isJdbcTypeNumeric(typeCode) ? getRSInt(colsRS, "NUM_PREC_RADIX") : null;
      @Nullable Integer pkPart = pkSeqNumsByName.get(name);
      @Nullable String comment = colsRS.getString("REMARKS");

      return new Field(name, dbType, typeCode, nullable, pkPart, length, prec, rad, fracDigs, comment);
    }
  }

  private int getTypeCodeForDateOrTimestampColumn
    (
      int driverReportedTypeCode,
      String dbNativeType
    )
  {
    String dbNativeTypeUc = dbNativeType.toUpperCase();

    if ("DATE".equals(dbNativeTypeUc))
    {
      if (dateMapping == DateMapping.DATES_AS_TIMESTAMPS)
        return Types.TIMESTAMP;
      else if (dateMapping == DateMapping.DATES_AS_DATES)
        return Types.DATE;
    }

    return driverReportedTypeCode;
  }


  /////////////////////////////////////////////////////////
  // auxiliary builder classes

  private static class FkBuilder
  {

    private final RelId srcRel;
    private final RelId tgtRel;
    private final @Nullable String constraintName;
    private final List<ForeignKeyComponent> comps;

    public FkBuilder(RelId srcRel, RelId tgtRel, @Nullable String constraintName)
    {
      this.srcRel = srcRel;
      this.tgtRel = tgtRel;
      this.constraintName = constraintName;
      this.comps = new ArrayList<>();
    }

    ForeignKey build()
    {
      return new ForeignKey(constraintName, srcRel, tgtRel, comps);
    }

    void addComponent(ForeignKeyComponent comp)
    {
      comps.add(comp);
    }
  }

  private static class RelMetadataBuilder
  {
    private final RelId relId;

    private final RelType relType;

    private final @Nullable String comment;

    private final List<Field> fields;

    public RelMetadataBuilder
      (
        RelId relId,
        RelType relType,
        @Nullable String comment
      )
    {
      this.relId = requireNonNull(relId);
      this.relType = requireNonNull(relType);
      this.comment = comment;
      this.fields = new ArrayList<>();
    }

    public void addField(Field f)
    {
      fields.add(f);
    }

    public RelMetadata build()
    {
      return new RelMetadata(relId, relType, fields, comment);
    }
  }

  // auxiliary builder classes
  /////////////////////////////////////////////////////////


  private static boolean matches(@Nullable Pattern pat, String s, boolean def)
  {
    return (pat == null) ? def : pat.matcher(s).matches();
  }

  // Get the property value for the first contained key if any.
  private static @Nullable String getProperty(Properties p, String... keys)
  {
    for (String key : keys)
    {
      if (p.containsKey(key))
        return p.getProperty(key);
    }
    return null;
  }

  private static String requireProperty(Properties p, String... keys)
  {
    String prop = getProperty(p, keys);
    if (prop == null)
      throw new RuntimeException("Property " + keys[0] + " is required.");
    return prop;
  }

  private static OutputStream outputStream(String pathOrDash)
    throws IOException
  {
    if ("-".equals(pathOrDash))
      return System.out;
    else
      return new FileOutputStream(pathOrDash);
  }

  public static boolean isJdbcTypeNumeric(int jdbcType)
  {
    return switch (jdbcType)
    {
      case Types.TINYINT,
           Types.SMALLINT,
           Types.INTEGER,
           Types.BIGINT,
           Types.FLOAT,
           Types.REAL,
           Types.DOUBLE,
           Types.DECIMAL,
           Types.NUMERIC -> true;
      default -> false;
    };
  }

  public static boolean isJdbcTypeChar(int jdbcType)
  {
    return
      switch (jdbcType)
      {
        case Types.CHAR, Types.VARCHAR, Types.LONGVARCHAR -> true;
        default -> false;
      };
  }

  record RelDescr
    (
      RelId relId,
      RelType relType,
      @Nullable String comment
    )
  {}
}
