{ pkgs, ... }:

{
  languages.go.enable = true;
  languages.javascript.enable = true;
  languages.javascript.bun.enable = true;
  languages.javascript.nodejs.enable = false;
  languages.javascript.lsp.enable = false;

  packages = [
    pkgs.go-swag
    pkgs.golangci-lint
    pkgs.mockgen
    pkgs.sqlite
  ];
}
