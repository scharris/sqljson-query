with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    deno
    openjdk11
    maven
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';

  # MYENVVAR="blah";
}
