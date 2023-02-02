{
  description = "SQL/JSON Query";

  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs-18_x
              nodePackages.typescript
              openjdk17
              maven
              graphviz-nox
              sqlite
              rlwrap
            ];
          };
        }
      );
}
