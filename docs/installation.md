# Installation

## Prerequisites

- **Node.js 20.19.0 or higher** — Check your version: `node --version`

## Package Managers

### npm

```bash
npm install -g @qaspec/cli@latest
```

### pnpm

```bash
pnpm add -g @qaspec/cli@latest
```

### yarn

```bash
yarn global add @qaspec/cli@latest
```

### bun

Bun can install QASpec globally, but the CLI currently runs on Node.js.
You still need Node.js 20.19.0 or higher available on `PATH`.

```bash
bun add -g @qaspec/cli@latest
```

## Nix

Run OpenSpec directly without installation:

```bash
nix run github:Fission-AI/OpenSpec -- init
```

Or install to your profile:

```bash
nix profile install github:Fission-AI/OpenSpec
```

Or add to your development environment in `flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    openspec.url = "github:Fission-AI/OpenSpec";
  };

  outputs = { nixpkgs, openspec, ... }: {
    devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {
      buildInputs = [ openspec.packages.x86_64-linux.default ];
    };
  };
}
```

## Verify Installation

```bash
qaspec --version
```

## Next Steps

After installing, initialize QASpec in your project:

```bash
cd your-project
qaspec init
```

See [Getting Started](getting-started.md) for a full walkthrough.
