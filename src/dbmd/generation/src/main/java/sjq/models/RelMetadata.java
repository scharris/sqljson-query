package sjq.models;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.jetbrains.annotations.Nullable;

@JsonPropertyOrder({"relationId", "relationType", "fields", "comment"})
public record RelMetadata
  (
    RelId relationId,
    RelType relationType,
    List<Field> fields,
    @Nullable String comment
  )
{
  @JsonIgnore()
  public List<Field> getPrimaryKeyFields()
  {
    List<Field> pks = new ArrayList<>();

    for (Field f : fields)
    {
      if (f.primaryKeyPartNumber() != null)
        pks.add(f);
    }

    pks.sort(Comparator.comparingInt(f -> f.primaryKeyPartNumber()));

    return pks;
  }
}
