with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs
    nodePackages.typescript
    openjdk11
    maven
    graphviz-nox
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';
}
