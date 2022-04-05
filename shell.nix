with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs-slim-16_x
    nodePackages.typescript
    openjdk17
    maven
    graphviz-nox
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';
}
