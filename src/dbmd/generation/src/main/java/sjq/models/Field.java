package sjq.models;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.jetbrains.annotations.Nullable;

@JsonPropertyOrder({
  "name", "databaseType", "jdbcTypeCode", "nullable", "primaryKeyPartNumber",
  "length", "precision", "precisionRadix", "fractionalDigits"
})
public record Field
  (
    String name,
    String databaseType,
    @Nullable Integer jdbcTypeCode,
    @Nullable Boolean nullable,
    @Nullable Integer primaryKeyPartNumber,
    @Nullable Integer length,
    @Nullable Integer precision,
    @Nullable Integer precisionRadix,
    @Nullable Integer fractionalDigits,
    @Nullable String comment
  )
{}
