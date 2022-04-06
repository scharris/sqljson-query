with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs-16_x
    nodePackages.typescript
    openjdk17
    maven
    graphviz-nox
    deno
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';
}
