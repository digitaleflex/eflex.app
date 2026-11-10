// Package node provides the safe, explicit Node.js production presets
// (#121, extended for EFLEX framework parity): npm/pnpm/yarn/bun, Next.js,
// Nuxt, Remix, SolidStart, RedwoodJS, Astro, SvelteKit and Vite runtime modes,
// pinned base images, lockfile-aware installs and non-root containers.
//
// Design decisions (documented per #121):
//
//   - Base images are pinned constants (node:20-alpine, nginx:1.27-alpine).
//   - Dependencies install from the lockfile when one is present
//     (npm ci / pnpm install --frozen-lockfile / yarn install --frozen-lockfile
//     / bun install --frozen-lockfile), so builds are reproducible; without a
//     lockfile the plain install command is used. pnpm and yarn are enabled
//     through Corepack, bun is installed with npm, because the pinned Node
//     image only ships npm.
//   - The runtime stage is minimal: package.json + lockfile + build output
//   - production-only node_modules. Production dependencies are installed
//     fresh with --prod/--production flags, never copied from the build
//     stage with dev dependencies. When package.json declares a start script
//     the whole project is kept instead, because the script may reference
//     files outside the build output.
//   - Containers run as the non-root user "node" (uid 1000) with
//     NODE_ENV=production and PORT set to the resolved port.
//   - There is deliberately no HEALTHCHECK instruction: minimal images ship
//     without curl/wget, and Axiom probes health externally (the profile
//     health check) instead of baking a probe into the image.
//   - Next.js note: the runtime stage copies package.json, the lockfile and
//     the .next build output. `next start` serves files from the public/
//     directory at runtime; repositories that rely on public/ assets should
//     use the dockerfile strategy instead.
package node

import (
	"fmt"

	"github.com/digitaleflex/axiom/services/engine/internal/runtime/presets"
)

// Pinned base images (#121).
const (
	Node20Alpine = "node:20-alpine"
	NginxAlpine  = "nginx:1.27-alpine"
)

// Runtime modes.
const (
	RuntimeNode   = "node"
	RuntimeStatic = "static"
)

// Facts are the analyzer/profile conclusions the preset resolves from
// ("" or 0 when unknown).
type Facts struct {
	PackageManager string // npm | pnpm | yarn | bun (empty = npm)
	HasBuildScript bool
	HasStartScript bool
	Framework      string // presets.Framework* or ""
	Adapter        string // presets.AdapterNode | presets.AdapterStatic | ""
	Port           int    // 0 = preset default
	HasLockfile    bool
	// KeepDevDependencies keeps the build-stage node_modules in the runtime
	// image. RedwoodJS needs it: its serve command usually comes from a
	// devDependency (@redwoodjs/cli).
	KeepDevDependencies bool
	// Explicit commands (manifest/override) take precedence over
	// script-derived commands.
	BuildCommand string
	StartCommand string
}

// NodePreset is a resolved, safe production preset.
type NodePreset struct {
	PackageManager string
	Runtime        string // node | static
	BuildCommand   string
	StartCommand   string
	Port           int
	HealthPath     string
	OutputDir      string // ".next", ".output", "dist", "build"; "" = run from source
	// KeepDevDependencies keeps node_modules from the build stage instead of
	// reinstalling production-only dependencies.
	KeepDevDependencies bool
}

// Resolve selects the safe preset for the facts. Unsupported configurations
// fail with an actionable error.
func Resolve(f Facts) (NodePreset, error) {
	pm := f.PackageManager
	if pm == "" {
		pm = presets.PackageManagerNPM
	}
	if !validPackageManager(pm) {
		return NodePreset{}, fmt.Errorf("unsupported package manager %q: must be npm, pnpm, yarn or bun", pm)
	}
	p := NodePreset{PackageManager: pm, HealthPath: "/", Runtime: RuntimeNode}
	switch f.Framework {
	case presets.FrameworkNextJS:
		p.OutputDir = ".next"
		p.Port = 3000
		p.BuildCommand = f.BuildCommand
		if p.BuildCommand == "" {
			if f.HasBuildScript {
				p.BuildCommand = run(pm, "build")
			} else {
				p.BuildCommand = exec(pm, "next build")
			}
		}
		p.StartCommand = f.StartCommand
		if p.StartCommand == "" {
			if f.HasStartScript {
				p.StartCommand = run(pm, "start")
			} else {
				p.StartCommand = exec(pm, "next start")
			}
		}
	case presets.FrameworkNuxt:
		p.OutputDir, p.Port = ".output", 3000
		p.BuildCommand = buildCommand(f, pm, "nuxt build")
		p.StartCommand, p.OutputDir = startCommand(f, pm, p.OutputDir, "node .output/server/index.mjs")
	case presets.FrameworkRemix:
		p.OutputDir, p.Port = "build", 3000
		p.BuildCommand = buildCommand(f, pm, "remix build")
		p.StartCommand, p.OutputDir = startCommand(f, pm, p.OutputDir, exec(pm, "remix-serve ./build/server/index.js"))
	case presets.FrameworkSolidStart:
		// The canonical start command changed between SolidStart majors: only
		// package.json (or an override) can be trusted.
		p.Port = 3000
		p.BuildCommand = buildCommand(f, pm, "vinxi build")
		if f.StartCommand == "" && !f.HasStartScript {
			return NodePreset{}, fmt.Errorf("SolidStart has no stable start command across versions: add a \"start\" script to package.json or set start.command in axiom.yaml")
		}
		p.StartCommand = f.StartCommand
		if p.StartCommand == "" {
			p.StartCommand = run(pm, "start")
		}
		p.OutputDir = ""
	case presets.FrameworkRedwoodJS:
		p.Port = 8910
		if f.BuildCommand == "" && !f.HasBuildScript {
			return NodePreset{}, fmt.Errorf("RedwoodJS requires a build script (usually \"rw build\") in package.json")
		}
		p.BuildCommand = buildCommand(f, pm, "")
		if f.StartCommand == "" && !f.HasStartScript {
			return NodePreset{}, fmt.Errorf("RedwoodJS requires a start script (usually \"rw serve\") in package.json")
		}
		p.StartCommand = f.StartCommand
		if p.StartCommand == "" {
			p.StartCommand = run(pm, "start")
		}
		p.OutputDir = ""
		p.KeepDevDependencies = true
	case presets.FrameworkAstro:
		if f.Adapter == presets.AdapterNode {
			p.OutputDir, p.Port = "dist", 3000
			p.BuildCommand = buildCommand(f, pm, "astro build")
			p.StartCommand, p.OutputDir = startCommand(f, pm, p.OutputDir, "node ./dist/server/entry.mjs")
		} else {
			if f.StartCommand != "" {
				return NodePreset{}, fmt.Errorf("Astro without a Node adapter builds static output; a start command makes no sense")
			}
			p.Runtime, p.OutputDir, p.Port = RuntimeStatic, "dist", 8080
			p.BuildCommand = buildCommand(f, pm, "astro build")
		}
	case presets.FrameworkSvelteKit:
		switch f.Adapter {
		case presets.AdapterNode:
			p.OutputDir, p.Port = "build", 3000
			p.BuildCommand = buildCommand(f, pm, "vite build")
			p.StartCommand, p.OutputDir = startCommand(f, pm, p.OutputDir, "node build/index.js")
		case presets.AdapterStatic:
			if f.StartCommand != "" {
				return NodePreset{}, fmt.Errorf("SvelteKit with adapter-static builds static output; a start command makes no sense")
			}
			p.Runtime, p.OutputDir, p.Port = RuntimeStatic, "build", 8080
			p.BuildCommand = buildCommand(f, pm, "vite build")
		default:
			if f.StartCommand == "" && !f.HasStartScript {
				return NodePreset{}, fmt.Errorf("SvelteKit needs @sveltejs/adapter-node, @sveltejs/adapter-static or a start script")
			}
			p.Port = 3000
			p.BuildCommand = buildCommand(f, pm, "vite build")
			p.StartCommand = f.StartCommand
			if p.StartCommand == "" {
				p.StartCommand = run(pm, "start")
			}
			p.OutputDir = ""
		}
	case presets.FrameworkVite:
		if f.StartCommand != "" {
			return NodePreset{}, fmt.Errorf("framework Vite builds static output; a start command makes no sense")
		}
		p.Runtime, p.OutputDir, p.Port = RuntimeStatic, "dist", 8080
		p.BuildCommand = buildCommand(f, pm, "vite build")
	default:
		if f.StartCommand == "" && !f.HasStartScript {
			return NodePreset{}, fmt.Errorf("no start command: add a \"start\" script to package.json or set start.command in axiom.yaml")
		}
		p.Port = 3000
		p.BuildCommand = f.BuildCommand
		if p.BuildCommand == "" && f.HasBuildScript {
			p.BuildCommand = run(pm, "build")
		}
		p.StartCommand = f.StartCommand
		if p.StartCommand == "" {
			p.StartCommand = run(pm, "start")
		}
	}
	// Static output listens on the port baked into the generated nginx
	// configuration; only Node runtimes accept a port override.
	if f.Port > 0 && p.Runtime == RuntimeNode {
		p.Port = f.Port
	}
	if p.Runtime == RuntimeStatic {
		// A start command would never run: nginx serves the output.
		if p.StartCommand != "" {
			return NodePreset{}, fmt.Errorf("framework %s builds static output; a start command makes no sense", f.Framework)
		}
	}
	return p, nil
}

// buildCommand prefers explicit commands, then package.json scripts, then the
// framework's canonical build command.
func buildCommand(f Facts, pm, fallback string) string {
	if f.BuildCommand != "" {
		return f.BuildCommand
	}
	if f.HasBuildScript {
		return run(pm, "build")
	}
	if fallback != "" {
		return exec(pm, fallback)
	}
	return ""
}

// startCommand prefers explicit commands, then the start script (keeping the
// whole project in the image), then the canonical command and its output dir.
func startCommand(f Facts, pm, outputDir, fallback string) (string, string) {
	if f.StartCommand != "" {
		return f.StartCommand, ""
	}
	if f.HasStartScript {
		return run(pm, "start"), ""
	}
	return fallback, outputDir
}

func validPackageManager(pm string) bool {
	switch pm {
	case presets.PackageManagerNPM, presets.PackageManagerPNPM, presets.PackageManagerYarn, presets.PackageManagerBun:
		return true
	}
	return false
}

// run returns "<pm> run <script>" with the conventional short forms.
func run(pm, script string) string {
	switch {
	case script == "start" && (pm == presets.PackageManagerNPM || pm == presets.PackageManagerPNPM || pm == presets.PackageManagerYarn):
		return pm + " start"
	default:
		return pm + " run " + script
	}
}

func exec(pm, cmd string) string {
	switch pm {
	case presets.PackageManagerPNPM:
		return "pnpm exec " + cmd
	case presets.PackageManagerYarn:
		return "yarn " + cmd
	case presets.PackageManagerBun:
		return "bunx " + cmd
	default:
		return "npx " + cmd
	}
}
