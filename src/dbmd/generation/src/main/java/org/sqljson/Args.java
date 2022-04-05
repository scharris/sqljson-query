package org.sqljson;

import java.util.List;
import java.util.Optional;


public class Args
{
  private Args() {}

  public static int pluckIntOption(List<String> remArgs, String optionName, int defaultValue)
  {
    if ( remArgs.contains(optionName) )
    {
      int argIx = remArgs.indexOf(optionName);
      remArgs.remove(argIx);
      return Integer.parseInt(remArgs.remove(argIx));
    }

    return defaultValue;
  }

  public static Optional<String> pluckStringOption(List<String> remArgs, String optionName)
  {
    int argIx = remArgs.indexOf(optionName);

    if ( argIx != -1 )
    {
      remArgs.remove(argIx);
      return Optional.of(remArgs.remove(argIx));
    }

    return Optional.empty();
  }
}
