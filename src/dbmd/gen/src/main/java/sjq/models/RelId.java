package sjq.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.jetbrains.annotations.Nullable;

@JsonPropertyOrder({"name", "schema"})
public record RelId
  (
    @Nullable String schema,
    String name
  )
{
   public String toString()
  {
    return getIdString();
  }

  @JsonIgnore
  public String getIdString()
  {
    return (schema == null) ? name : schema + "." + name;
  }
}
