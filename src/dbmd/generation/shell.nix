with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs-slim-16_x
    nodePackages.typescript
    openjdk17
    maven
  ];
  shellHook = ''
    echo Welcome to the sqljson-query-dropin project.
  '';
}
