// Package presets holds the shared types for Axiom's runtime preset
// packages (#121+). Each supported runtime gets its own sub-package with
// safe, explicit, testable build/runtime presets; the shared vocabulary
// lives here so presets stay consistent.
package presets

// Package managers with dedicated runtime presets.
const (
	PackageManagerNPM  = "npm"
	PackageManagerPNPM = "pnpm"
	PackageManagerYarn = "yarn"
	PackageManagerBun  = "bun"
)

// Frameworks with dedicated runtime presets.
const (
	FrameworkNextJS     = "Next.js"
	FrameworkVite       = "Vite"
	FrameworkNuxt       = "Nuxt"
	FrameworkAstro      = "Astro"
	FrameworkSvelteKit  = "SvelteKit"
	FrameworkRemix      = "Remix"
	FrameworkSolidStart = "SolidStart"
	FrameworkRedwoodJS  = "RedwoodJS"
)

// Adapter modes for frameworks that can be served by Node or as static files.
const (
	AdapterNode   = "node"
	AdapterStatic = "static"
)

// PythonVersion is the CPython minor version the Python preset builds with.
// The analyzer warns when a repository declares another one.
const PythonVersion = "3.12"

// PHPVersion is the PHP minor version the PHP preset builds with
// (php:<version>-fpm-bookworm). The analyzer warns when composer.json requires
// another one.
const PHPVersion = "8.3"

// Python frameworks with dedicated runtime presets.
const (
	FrameworkFastAPI = "FastAPI"
	FrameworkFlask   = "Flask"
	FrameworkDjango  = "Django"
)
