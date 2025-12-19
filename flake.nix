{
  description = "Gist - Next.js project with bun";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    prisma-utils.url = "github:VanCoding/nix-prisma-utils";
  };

  outputs = {
    nixpkgs,
    flake-utils,
    prisma-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
        prisma = prisma-utils.lib.prisma-factory {
          inherit pkgs;
          hash = "sha256-c3ryuV+IG2iumFPOBdcEgF0waa+KGrn7Ken2CRuupwg=";
          bunLock = ./bun.lock;
        };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
            sqlite
            openssl

            # better-sqlite3 native build dependencies
            python3
            pkg-config
            gcc
          ];

          env = prisma.env;
        };

        formatter = pkgs.alejandra;
      }
    );
}
