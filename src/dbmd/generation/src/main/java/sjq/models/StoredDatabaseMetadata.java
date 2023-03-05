package sjq.models;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"dbmsName", "dbmsVersion", "caseSensitivity", "relationMetadatas", "foreignKeys"})
public record StoredDatabaseMetadata
  (
    String dbmsName,
    String dbmsVersion,
    int majorVersion,
    int minorVersion,
    CaseSensitivity caseSensitivity,
    List<RelMetadata> relationMetadatas,
    List<ForeignKey> foreignKeys
  )
{}
