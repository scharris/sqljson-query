package sjq.models;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.jetbrains.annotations.Nullable;

@JsonPropertyOrder({
  "dbmsName", "dbmsVersion", "majorVersion", "minorVersion", "caseSensitivity",
  "relationMetadatas", "foreignKeys"
})
public record StoredDatabaseMetadata
  (
    String dbmsName,
    String dbmsVersion,
    @Nullable  Integer majorVersion,
    @Nullable Integer minorVersion,
    CaseSensitivity caseSensitivity,
    List<RelMetadata> relationMetadatas,
    List<ForeignKey> foreignKeys
  )
{}
