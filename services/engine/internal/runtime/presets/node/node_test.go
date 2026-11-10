package node

import (
	"testing"

	"github.com/digitaleflex/axiom/services/engine/internal/runtime/presets"
)

func TestResolve(t *testing.T) {
	t.Run("unsupported package manager", func(t *testing.T) {
		if _, err := Resolve(Facts{PackageManager: "cargo"}); err == nil {
			t.Fatal("cargo must be rejected")
		}
	})

	t.Run("empty package manager defaults to npm", func(t *testing.T) {
		p, err := Resolve(Facts{HasStartScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.PackageManager != presets.PackageManagerNPM {
			t.Fatalf("pm = %q", p.PackageManager)
		}
	})

	t.Run("nextjs with scripts", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "pnpm", Framework: presets.FrameworkNextJS, HasBuildScript: true, HasStartScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "pnpm run build" || p.StartCommand != "pnpm start" {
			t.Fatalf("commands = %q / %q", p.BuildCommand, p.StartCommand)
		}
		if p.Port != 3000 || p.HealthPath != "/" || p.OutputDir != ".next" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("nextjs without scripts uses exec", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkNextJS})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "npx next build" || p.StartCommand != "npx next start" {
			t.Fatalf("commands = %q / %q", p.BuildCommand, p.StartCommand)
		}
	})

	t.Run("nextjs explicit commands win", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "yarn", Framework: presets.FrameworkNextJS, BuildCommand: "yarn build", StartCommand: "yarn serve"})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "yarn build" || p.StartCommand != "yarn serve" {
			t.Fatalf("commands = %q / %q", p.BuildCommand, p.StartCommand)
		}
	})

	t.Run("nextjs port override", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkNextJS, HasStartScript: true, Port: 4000})
		if err != nil {
			t.Fatal(err)
		}
		if p.Port != 4000 {
			t.Fatalf("port = %d", p.Port)
		}
	})

	t.Run("generic node without start fails clearly", func(t *testing.T) {
		_, err := Resolve(Facts{PackageManager: "npm"})
		if err == nil {
			t.Fatal("a Node.js app without a start command must not resolve")
		}
	})

	t.Run("generic node with start script", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", HasBuildScript: true, HasStartScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "npm run build" || p.StartCommand != "npm start" || p.Port != 3000 || p.OutputDir != "" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("generic node explicit start command", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", StartCommand: "node server.js"})
		if err != nil {
			t.Fatal(err)
		}
		if p.StartCommand != "node server.js" || p.BuildCommand != "" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("vite", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "pnpm", Framework: presets.FrameworkVite, HasBuildScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "pnpm run build" || p.StartCommand != "" || p.OutputDir != "dist" || p.Port != 8080 {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("vite rejects a start command", func(t *testing.T) {
		if _, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkVite, StartCommand: "npm start"}); err == nil {
			t.Fatal("static output cannot have a start command")
		}
	})

	t.Run("nuxt without a start script", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkNuxt})
		if err != nil {
			t.Fatal(err)
		}
		if p.BuildCommand != "npx nuxt build" || p.StartCommand != "node .output/server/index.mjs" || p.OutputDir != ".output" || p.Port != 3000 {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("nuxt start script keeps the project", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "pnpm", Framework: presets.FrameworkNuxt, HasBuildScript: true, HasStartScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.StartCommand != "pnpm start" || p.OutputDir != "" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("remix without scripts", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkRemix})
		if err != nil {
			t.Fatal(err)
		}
		if p.StartCommand != "npx remix-serve ./build/server/index.js" || p.OutputDir != "build" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("solidstart requires a start command", func(t *testing.T) {
		if _, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkSolidStart, HasBuildScript: true}); err == nil {
			t.Fatal("SolidStart without a start script must fail")
		}
	})

	t.Run("redwoodjs requires scripts and keeps dev dependencies", func(t *testing.T) {
		if _, err := Resolve(Facts{PackageManager: "yarn", Framework: presets.FrameworkRedwoodJS, HasStartScript: true}); err == nil {
			t.Fatal("RedwoodJS without a build script must fail")
		}
		p, err := Resolve(Facts{PackageManager: "yarn", Framework: presets.FrameworkRedwoodJS, HasBuildScript: true, HasStartScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.StartCommand != "yarn start" || p.Port != 8910 || !p.KeepDevDependencies {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("astro defaults to static", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkAstro, HasBuildScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.Runtime != RuntimeStatic || p.OutputDir != "dist" || p.Port != 8080 || p.StartCommand != "" {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("astro with the node adapter", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkAstro, Adapter: presets.AdapterNode, HasBuildScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.Runtime != RuntimeNode || p.StartCommand != "node ./dist/server/entry.mjs" || p.Port != 3000 {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("sveltekit static adapter", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkSvelteKit, Adapter: presets.AdapterStatic, HasBuildScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.Runtime != RuntimeStatic || p.OutputDir != "build" || p.Port != 8080 {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("sveltekit node adapter", func(t *testing.T) {
		p, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkSvelteKit, Adapter: presets.AdapterNode, HasBuildScript: true})
		if err != nil {
			t.Fatal(err)
		}
		if p.StartCommand != "node build/index.js" || p.OutputDir != "build" || p.Port != 3000 {
			t.Fatalf("preset = %+v", p)
		}
	})

	t.Run("sveltekit without an adapter", func(t *testing.T) {
		if _, err := Resolve(Facts{PackageManager: "npm", Framework: presets.FrameworkSvelteKit, HasBuildScript: true}); err == nil {
			t.Fatal("SvelteKit without an adapter must fail")
		}
	})
}
