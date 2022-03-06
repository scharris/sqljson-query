with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs
    nodePackages.typescript
    openjdk17
    maven
    graphviz-nox
    nushell
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';
}
