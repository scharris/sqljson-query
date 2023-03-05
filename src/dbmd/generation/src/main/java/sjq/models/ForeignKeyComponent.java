package sjq.models;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"foreignKeyFieldName", "primaryKeyFieldName"})
public record ForeignKeyComponent
  (
    String foreignKeyFieldName,
    String primaryKeyFieldName
  )
{}
