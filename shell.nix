with (import <nixpkgs> {});

mkShell {
  buildInputs = [
    nodejs
    nodePackages.typescript
  ];

  shellHook = ''
    echo Welcome to the sql-json-query project.
  '';

  # MYENVVAR="blah";
}
