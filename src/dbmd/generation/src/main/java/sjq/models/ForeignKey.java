package sjq.models;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.jetbrains.annotations.Nullable;

@JsonPropertyOrder({"constraintName", "foreignKeyRelationId", "primaryKeyRelationId", "foreignKeyComponents"})
public record ForeignKey
  (
    @Nullable String constraintName,
    RelId foreignKeyRelationId,
    RelId primaryKeyRelationId,
    List<ForeignKeyComponent> foreignKeyComponents
  )
{}
