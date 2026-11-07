// Package presets maps detected application facts to the explicit V0.1
// build/runtime presets (issue #96). Commands are produced only from fixed
// templates; anything else is rejected with an actionable reason.
package presets

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Preset names (V0.1).
const (
	NextJS     = "nextjs"
	Vite       = "vite"
	Node       = "node"
	Go         = "go"
	Python     = "python"
	Dockerfile = "dockerfile"
	Compose    = "compose"
)

// Container strategies.
const (
	StrategySource     = "source"     // image built by Axiom from a preset template
	StrategyDockerfile = "dockerfile" // image built from the repository Dockerfile
	StrategyCompose    = "compose"    // services defined by the repository compose file
)

// Unsupported reason codes (machine-readable, surfaced to the UI).
const (
	ReasonNoApplication   = "NO_APPLICATION_DETECTED"
	ReasonAmbiguousRoot   = "AMBIGUOUS_APPLICATION_ROOT"
	ReasonLanguage        = "UNSUPPORTED_LANGUAGE"
	ReasonFramework       = "UNSUPPORTED_FRAMEWORK"
	ReasonMissingStart    = "MISSING_START_COMMAND"
	ReasonNoGoEntrypoint  = "NO_GO_ENTRYPOINT"
	ReasonComposeServices = "COMPOSE_WITHOUT_SERVICES"
	ReasonPythonManifest  = "PYTHON_REQUIREMENTS_MISSING"
	ReasonNoPythonEntry   = "NO_PYTHON_ENTRYPOINT"
)

// Facts are the analyzer conclusions presets depend on ("" when unknown).
type Facts struct {
	Language       string
	Framework      string
	FrameworkState string // evidence state, e.g. "unsupported", "ambiguous"
	PackageManager string
	Container      string // "dockerfile" | "compose" | ""
	ContainerState string
	HasBuildScript bool
	HasStartScript bool
	GoEntrypoints  []string
	// PythonEntrypoints are "module:attribute" application objects found in the code.
	PythonEntrypoints []string
	ComposeServices   []string
	RootAmbiguous     bool
	RootCandidates    []string
}

// Preset is a resolved build/runtime strategy with safe defaults.
type Preset struct {
	Name         string
	Strategy     string
	Runtime      string // node | static | go | image | compose
	BuildCommand string // "" when the strategy builds without a command (Dockerfile/compose/static)
	StartCommand string // "" when the image/compose defines it
	DefaultPort  int    // 0 = must be detected or provided
	HealthType   string
	HealthPath   string
	OutputDir    string // static presets
	// NeedsEntrypointChoice is set when several Go main packages exist.
	EntrypointCandidates []string
}

// Rejection explains why no preset applies.
type Rejection struct {
	Code         string
	Message      string
	Detected     string
	Alternatives []string
}

var alternatives = []string{
	"Add a Dockerfile to the repository to deploy any stack as a container",
	"Add an axiom.yaml manifest with explicit build and start commands",
	"Supported in V0.1: Next.js, Vite, Node.js, Go, Python (FastAPI, Flask, Django with a requirements.txt), Dockerfile, Docker Compose",
}

// Resolve selects the preset. Precedence: explicit container definitions
// (compose, Dockerfile) first, then framework presets, then language presets.
func Resolve(f Facts) (Preset, *Rejection) {
	if f.RootAmbiguous {
		return Preset{}, &Rejection{Code: ReasonAmbiguousRoot, Message: "several applications were found; choose the application directory",
			Detected: strings.Join(f.RootCandidates, ", "), Alternatives: []string{"Set app.root in axiom.yaml or choose a directory in Axiom"}}
	}
	switch f.Container {
	case "compose":
		if len(f.ComposeServices) == 0 {
			return Preset{}, &Rejection{Code: ReasonComposeServices, Message: "the compose file defines no services", Alternatives: alternatives}
		}
		return Preset{Name: Compose, Strategy: StrategyCompose, Runtime: "compose", HealthType: "http", HealthPath: "/"}, nil
	case "dockerfile":
		return Preset{Name: Dockerfile, Strategy: StrategyDockerfile, Runtime: "image", HealthType: "http", HealthPath: "/"}, nil
	}
	if f.FrameworkState == "unsupported" {
		return Preset{}, &Rejection{Code: ReasonFramework, Message: f.Framework + " is not supported in V0.1", Detected: f.Framework, Alternatives: alternatives}
	}
	switch f.Language {
	case "TypeScript", "JavaScript":
		pm := f.PackageManager
		if !validPM(pm) {
			pm = "npm"
		}
		switch f.Framework {
		case "Next.js":
			p := Preset{Name: NextJS, Strategy: StrategySource, Runtime: "node", DefaultPort: 3000, HealthType: "http", HealthPath: "/",
				BuildCommand: run(pm, "build"), StartCommand: run(pm, "start")}
			if !f.HasStartScript {
				p.StartCommand = exec(pm, "next start")
			}
			if !f.HasBuildScript {
				p.BuildCommand = exec(pm, "next build")
			}
			return p, nil
		case "Vite":
			return Preset{Name: Vite, Strategy: StrategySource, Runtime: "static", DefaultPort: 8080, HealthType: "http", HealthPath: "/",
				BuildCommand: run(pm, "build"), OutputDir: "dist"}, nil
		}
		if !f.HasStartScript {
			return Preset{}, &Rejection{Code: ReasonMissingStart, Message: "package.json has no start script, so Axiom cannot know how to run the application",
				Detected:     "Node.js (" + nonEmpty(f.Framework, "no framework") + ")",
				Alternatives: []string{"Add a \"start\" script to package.json", "Set start.command in axiom.yaml", "Add a Dockerfile"}}
		}
		p := Preset{Name: Node, Strategy: StrategySource, Runtime: "node", DefaultPort: 3000, HealthType: "http", HealthPath: "/", StartCommand: run(pm, "start")}
		if f.HasBuildScript {
			p.BuildCommand = run(pm, "build")
		}
		return p, nil
	case "Go":
		switch len(f.GoEntrypoints) {
		case 0:
			return Preset{}, &Rejection{Code: ReasonNoGoEntrypoint, Message: "no main package was found in the Go module", Detected: "Go", Alternatives: alternatives}
		case 1:
			return goPreset(f.GoEntrypoints[0]), nil
		default:
			p := goPreset(f.GoEntrypoints[0])
			p.EntrypointCandidates = append([]string(nil), f.GoEntrypoints...)
			return p, nil
		}
	case "Python":
		return pythonPreset(f)
	case "":
		return Preset{}, &Rejection{Code: ReasonNoApplication, Message: "no supported application manifest was found", Alternatives: alternatives}
	default:
		return Preset{}, &Rejection{Code: ReasonLanguage, Message: f.Language + " is not supported in V0.1 without a Dockerfile", Detected: f.Language, Alternatives: alternatives}
	}
}

// GoBuild returns the canonical build command for a main package.
func GoBuild(entrypoint string) string { return "go build -trimpath -o ./axiom-app " + entrypoint }

func goPreset(entry string) Preset {
	return Preset{Name: Go, Strategy: StrategySource, Runtime: "go", DefaultPort: 8080, HealthType: "http", HealthPath: "/",
		BuildCommand: GoBuild(entry), StartCommand: "./axiom-app"}
}

// Python preset ------------------------------------------------------------------

const pipInstall = "pip install --no-cache-dir -r requirements.txt"

// PythonBuild returns the canonical build command. The ASGI/WSGI server is installed
// after the requirements: pip leaves an already satisfied requirement untouched, so a
// repository that pins its own server keeps its version.
func PythonBuild(framework string) string {
	switch framework {
	case "FastAPI":
		return pipInstall + " && pip install --no-cache-dir uvicorn"
	case "Flask", "Django":
		return pipInstall + " && pip install --no-cache-dir gunicorn"
	default:
		return pipInstall
	}
}

// PythonStart returns the canonical start command for an application object
// ("module:attribute"); Django's is "<project>.wsgi:application".
func PythonStart(framework, entry string, port int) string {
	if framework == "FastAPI" {
		return fmt.Sprintf("uvicorn %s --host 0.0.0.0 --port %d", entry, port)
	}
	return fmt.Sprintf("gunicorn --bind 0.0.0.0:%d %s", port, entry)
}

var pythonEntryRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*:[A-Za-z_][A-Za-z0-9_]*$`)

// ValidatePythonEntrypoint checks a user-provided "module:attribute" value. It ends up
// in a start command, so anything but identifiers and dots is refused.
func ValidatePythonEntrypoint(entry string) error {
	if !pythonEntryRe.MatchString(entry) {
		return fmt.Errorf("%w: the entrypoint must look like module:attribute (for example main:app)", ErrUnsafeCommand)
	}
	return nil
}

func pythonPreset(f Facts) (Preset, *Rejection) {
	detected := "Python (" + nonEmpty(f.Framework, "no framework") + ")"
	if f.PackageManager != "pip" {
		return Preset{}, &Rejection{Code: ReasonPythonManifest, Message: "no requirements.txt was found, so Axiom cannot install the Python dependencies",
			Detected: detected, Alternatives: []string{
				"Add a requirements.txt listing the dependencies (pip freeze > requirements.txt)",
				"Add a Dockerfile",
				"Poetry, uv and Pipenv projects are not supported yet",
			}}
	}
	switch f.Framework {
	case "FastAPI", "Flask", "Django":
	default:
		if !f.HasStartScript {
			return Preset{}, &Rejection{Code: ReasonFramework, Message: "no supported Python framework (FastAPI, Flask or Django) was detected, so Axiom cannot know how to run the application",
				Detected: detected, Alternatives: []string{
					"Set start.command in axiom.yaml",
					"Add a Dockerfile",
					"The framework is read from requirements.txt only: files included with -r are not followed yet",
				}}
		}
	}
	p := Preset{Name: Python, Strategy: StrategySource, Runtime: "python", DefaultPort: 8000, HealthType: "http", HealthPath: "/",
		BuildCommand: PythonBuild(f.Framework)}
	switch len(f.PythonEntrypoints) {
	case 0:
		if !f.HasStartScript {
			return Preset{}, &Rejection{Code: ReasonNoPythonEntry, Message: "no application object was found (app = FastAPI(...), app = Flask(...) or Django's wsgi.py)",
				Detected: detected, Alternatives: []string{
					"Expose the application at module level, for example app = FastAPI()",
					"Set start.command in axiom.yaml",
					"Add a Dockerfile",
				}}
		}
	case 1:
		p.StartCommand = PythonStart(f.Framework, f.PythonEntrypoints[0], p.DefaultPort)
	default:
		p.StartCommand = PythonStart(f.Framework, f.PythonEntrypoints[0], p.DefaultPort)
		p.EntrypointCandidates = append([]string(nil), f.PythonEntrypoints...)
	}
	return p, nil
}

func validPM(pm string) bool { return pm == "npm" || pm == "pnpm" || pm == "yarn" || pm == "bun" }

// run returns "<pm> run <script>" with the conventional short forms.
func run(pm, script string) string {
	switch {
	case script == "start" && (pm == "npm" || pm == "pnpm" || pm == "yarn"):
		return pm + " start"
	default:
		return pm + " run " + script
	}
}

func exec(pm, cmd string) string {
	switch pm {
	case "pnpm":
		return "pnpm exec " + cmd
	case "yarn":
		return "yarn " + cmd
	case "bun":
		return "bunx " + cmd
	default:
		return "npx " + cmd
	}
}

func nonEmpty(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}

// ErrUnsafeCommand rejects commands that are not acceptable as build/start commands.
var ErrUnsafeCommand = errors.New("unsafe command")

var commandRe = regexp.MustCompile(`^[\x20-\x7E]{1,500}$`)

// ValidateCommand checks a user/manifest-provided command. Commands run inside
// the build/runtime boundary (never during analysis), but obviously unsafe
// constructs (control characters, command substitution, here-docs) are refused.
func ValidateCommand(cmd string) error {
	cmd = strings.TrimSpace(cmd)
	if !commandRe.MatchString(cmd) {
		return fmt.Errorf("%w: commands must be a single line of printable ASCII up to 500 characters", ErrUnsafeCommand)
	}
	for _, bad := range []string{"`", "$(", "<<", "sudo ", "rm -rf /", "curl ", "wget "} {
		if strings.Contains(cmd, bad) {
			return fmt.Errorf("%w: %q is not allowed", ErrUnsafeCommand, strings.TrimSpace(bad))
		}
	}
	return nil
}

// ValidatePackageManager checks an override value.
func ValidatePackageManager(pm string) error {
	if validPM(pm) || pm == "go" || pm == "pip" {
		return nil
	}
	return fmt.Errorf("%w: package manager must be npm, pnpm, yarn, bun, pip or go", ErrUnsafeCommand)
}
