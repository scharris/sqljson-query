with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    deno
    openjdk11
    maven
    graphviz-nox
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project \(deno branch\).
  '';
}
